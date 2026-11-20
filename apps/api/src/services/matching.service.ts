import {
  AidType,
  AidStatus,
  NeedUrgency,
  MatchStatus,
  NeedStatus,
  MatchCandidate,
  MatchScoreBreakdown,
  AidOfferRecord,
  AidNeedRecord,
  MatchRecord,
  CreateAidOfferInput,
  AidOfferQueryInput,
  CreateAidNeedInput,
  AidNeedQueryInput,
  ConfirmMatchInput,
  ProviderMatchResponseInput,
} from '@relieflink/shared';
import { matchingRepository } from '../repositories/matching.repository.js';
import { reportRepository } from '../repositories/report.repository.js';
import { calculateHaversineDistanceMeters } from '../utils/geo.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { getIO } from '../socket/index.js';
import { logger } from '../config/logger.js';

export interface MatchingWeights {
  typeFitWeight: number; // 30
  distanceWeight: number; // 25
  capacityWeight: number; // 20
  reliabilityWeight: number; // 15
  urgencyWeight: number; // 10
  averageDisasterSpeedKmH: number; // 35
  dispatchPrepMinutes: number; // 15
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  typeFitWeight: 30,
  distanceWeight: 25,
  capacityWeight: 20,
  reliabilityWeight: 15,
  urgencyWeight: 10,
  averageDisasterSpeedKmH: 35,
  dispatchPrepMinutes: 15,
};

export class MatchingService {
  private weights = DEFAULT_MATCHING_WEIGHTS;

  /**
   * Evaluates a single offer against a need and produces a transparent score breakdown.
   */
  public calculateMatchScore(
    need: AidNeedRecord,
    offer: AidOfferRecord,
    providerReliability = 0.95
  ): {
    compatibilityScore: number;
    distanceMeters: number;
    estimatedTravelMinutes: number;
    scoreBreakdown: MatchScoreBreakdown;
  } {
    const reasons: string[] = [];

    // 1. Type Fit (30 points)
    let typeFitScore = 0;
    if (offer.aidType === need.aidType) {
      typeFitScore = this.weights.typeFitWeight;
      reasons.push(`Exact resource type match: ${offer.aidType}`);
    } else {
      reasons.push(`Incompatible resource type (${offer.aidType} vs required ${need.aidType})`);
    }

    // 2. Distance & Travel Time (25 points)
    const distanceMeters = calculateHaversineDistanceMeters(
      need.latitude,
      need.longitude,
      offer.latitude,
      offer.longitude
    );
    const distanceKm = distanceMeters / 1000;
    const serviceRadius = offer.serviceRadiusKm || 30.0;

    let distanceScore = 0;
    if (distanceKm <= serviceRadius) {
      // Linear falloff within radius
      const factor = Math.max(0, 1 - distanceKm / (serviceRadius * 1.25));
      distanceScore = Math.round(this.weights.distanceWeight * factor * 10) / 10;
      reasons.push(
        `Located ${distanceKm.toFixed(1)} km away (within ${serviceRadius} km service radius)`
      );
    } else {
      // Exceeds stated radius - heavy falloff
      const factor = Math.max(0, 1 - distanceKm / (serviceRadius * 2)) * 0.3;
      distanceScore = Math.round(this.weights.distanceWeight * factor * 10) / 10;
      reasons.push(
        `Located ${distanceKm.toFixed(1)} km away (exceeds ${serviceRadius} km service radius)`
      );
    }

    const estimatedTravelMinutes = Math.round(
      this.weights.dispatchPrepMinutes + (distanceKm / this.weights.averageDisasterSpeedKmH) * 60
    );

    // 3. Available Capacity Fit (20 points)
    const available = offer.capacityRemaining;
    const required = need.quantityRequired;
    const fulfillRatio = Math.min(1.0, available / required);

    let capacityScore = Math.round(this.weights.capacityWeight * fulfillRatio * 10) / 10;
    if (fulfillRatio >= 1.0) {
      reasons.push(
        `Full capacity available: ${available} ${offer.unit} available for ${required} requested`
      );
    } else {
      reasons.push(
        `Partial capacity available: ${available} / ${required} ${offer.unit} (${Math.round(fulfillRatio * 100)}%)`
      );
    }

    // 4. Provider Reliability Score (15 points)
    const clampedReliability = Math.max(0.1, Math.min(1.0, providerReliability));
    const reliabilityScore =
      Math.round(this.weights.reliabilityWeight * clampedReliability * 10) / 10;
    reasons.push(`Provider historical reliability rating: ${Math.round(clampedReliability * 100)}%`);

    // 5. Urgency Multiplier & Adjustment (10 points)
    let urgencyScore = 6;
    if (need.urgency === NeedUrgency.IMMEDIATE) {
      urgencyScore = distanceKm <= 10 ? 10 : 7;
      reasons.push(
        `High priority urgency: IMMEDIATE response required (${urgencyScore}/${this.weights.urgencyWeight} pts)`
      );
    } else if (need.urgency === NeedUrgency.URGENT) {
      urgencyScore = 8;
      reasons.push(`Urgency level: URGENT (8/${this.weights.urgencyWeight} pts)`);
    } else if (need.urgency === NeedUrgency.STANDARD) {
      urgencyScore = 6;
      reasons.push(`Urgency level: STANDARD (6/${this.weights.urgencyWeight} pts)`);
    } else {
      urgencyScore = 4;
      reasons.push(`Urgency level: FLEXIBLE (4/${this.weights.urgencyWeight} pts)`);
    }

    const rawTotal = typeFitScore + distanceScore + capacityScore + reliabilityScore + urgencyScore;
    const compositeScore = Math.min(100, Math.max(0, Math.round(rawTotal * 10) / 10));

    return {
      compatibilityScore: compositeScore,
      distanceMeters,
      estimatedTravelMinutes,
      scoreBreakdown: {
        typeFitScore,
        distanceScore,
        capacityScore,
        reliabilityScore,
        urgencyMultiplier:
          need.urgency === NeedUrgency.IMMEDIATE
            ? 1.5
            : need.urgency === NeedUrgency.URGENT
              ? 1.2
              : 1.0,
        estimatedDistanceKm: Math.round(distanceKm * 10) / 10,
        estimatedTravelMinutes,
        compositeScore,
        reasons,
      },
    };
  }

  /**
   * Discovers and ranks candidate offers for a given AidNeed.
   * Deterministic sorting: compatibilityScore DESC, distanceKm ASC, availableCapacity DESC.
   */
  public async findCandidateMatches(needId: string): Promise<{
    need: AidNeedRecord;
    candidates: MatchCandidate[];
    noMatchFound: boolean;
  }> {
    const need = await matchingRepository.getAidNeedById(needId);
    if (!need) throw new NotFoundError(`Aid need ${needId} not found`);

    // Fetch active offers of matching aid type
    const { offers } = await matchingRepository.listAidOffers({
      aidType: need.aidType,
      status: AidStatus.AVAILABLE,
      limit: 100,
    });

    const candidates: MatchCandidate[] = [];

    for (const offer of offers) {
      // Must have at least 1 unit available
      if (offer.capacityRemaining <= 0) continue;

      const calculation = this.calculateMatchScore(need, offer, 0.95);

      // Filter out completely incompatible offers (score < 25)
      if (calculation.compatibilityScore >= 25) {
        candidates.push({
          offerId: offer.id,
          organizationId: offer.organizationId,
          organizationName: offer.organizationName || 'Verified Aid Organization',
          providerReliabilityScore: 0.95,
          aidType: offer.aidType,
          title: offer.title,
          description: offer.description || undefined,
          capacityAvailable: offer.capacityRemaining,
          capacityTotal: offer.capacityTotal,
          unit: offer.unit,
          latitude: offer.latitude,
          longitude: offer.longitude,
          distanceKm: calculation.scoreBreakdown.estimatedDistanceKm,
          estimatedTravelMinutes: calculation.estimatedTravelMinutes,
          compatibilityScore: calculation.compatibilityScore,
          scoreBreakdown: calculation.scoreBreakdown,
          availableUntil: offer.availableUntil || undefined,
        });
      }
    }

    // Deterministic sorting
    candidates.sort((a, b) => {
      if (b.compatibilityScore !== a.compatibilityScore) {
        return b.compatibilityScore - a.compatibilityScore;
      }
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return b.capacityAvailable - a.capacityAvailable;
    });

    return {
      need,
      candidates,
      noMatchFound: candidates.length === 0,
    };
  }

  /**
   * Responder confirms a suggested match.
   * Atomically reserves stock on the offer and dispatches match request to the provider.
   */
  public async confirmMatch(
    input: ConfirmMatchInput,
    responderId: string
  ): Promise<MatchRecord> {
    const need = await matchingRepository.getAidNeedById(input.needId);
    if (!need) throw new NotFoundError(`Aid need ${input.needId} not found`);

    const offer = await matchingRepository.getAidOfferById(input.offerId);
    if (!offer) throw new NotFoundError(`Aid offer ${input.offerId} not found`);

    const calculation = this.calculateMatchScore(need, offer);

    const match = await matchingRepository.reserveStockAndConfirmMatch({
      needId: input.needId,
      offerId: input.offerId,
      requestedQuantity: input.requestedQuantity,
      compatibilityScore: calculation.compatibilityScore,
      distanceMeters: calculation.distanceMeters,
      estimatedTravelMins: calculation.estimatedTravelMinutes,
      scoreBreakdown: calculation.scoreBreakdown,
      timeoutMinutes: input.timeoutMinutes,
      responderId,
    });

    // Notify provider in real-time
    const io = getIO();
    if (io) {
      io.to(`org:${offer.organizationId}`).emit('match:proposed', {
        matchId: match.id,
        needTitle: need.reportTitle,
        aidType: need.aidType,
        quantity: match.matchedQuantity,
        unit: offer.unit,
        timeoutAt: match.timeoutAt,
      });
      io.to('responders:all').emit('match:confirmed_by_responder', {
        matchId: match.id,
        needId: need.id,
        offerId: offer.id,
      });
    }

    logger.info(
      { matchId: match.id, offerId: offer.id, quantity: input.requestedQuantity },
      'Aid match confirmed by responder and dispatched to provider'
    );

    return match;
  }

  /**
   * Provider accepts, declines, or partially fulfills a match request.
   */
  public async providerRespond(
    matchId: string,
    input: ProviderMatchResponseInput,
    organizationId: string
  ): Promise<{ match: MatchRecord; offer: AidOfferRecord }> {
    const result = await matchingRepository.providerRespondToMatch({
      matchId,
      action: input.action,
      declineReason: input.declineReason,
      partiallyFulfilledQuantity: input.partiallyFulfilledQuantity,
      notes: input.notes,
      organizationId,
    });

    const io = getIO();
    if (io) {
      io.to('responders:all').emit('match:provider_responded', {
        matchId,
        action: input.action,
        status: result.match.status,
        remainingStock: result.offer.capacityRemaining,
      });
      io.to(`org:${organizationId}`).emit('inventory:updated', {
        offerId: result.offer.id,
        capacityRemaining: result.offer.capacityRemaining,
        capacityReserved: result.offer.capacityReserved,
        capacityFulfilled: result.offer.capacityFulfilled,
      });
    }

    return result;
  }

  /**
   * Sweeps and re-routes any matches that exceeded their provider response deadline.
   */
  public async processTimeouts(): Promise<
    Array<{ timedOutMatch: MatchRecord; reroutedMatch: MatchRecord | null }>
  > {
    const results = await matchingRepository.processMatchTimeouts();

    if (results.length > 0) {
      const io = getIO();
      if (io) {
        for (const item of results) {
          io.to('responders:all').emit('match:timeout_rerouted', {
            timedOutMatchId: item.timedOutMatch.id,
            reroutedMatchId: item.reroutedMatch?.id || null,
          });
          if (item.reroutedMatch) {
            io.to(`org:${item.reroutedMatch.organizationId}`).emit('match:proposed', {
              matchId: item.reroutedMatch.id,
              quantity: item.reroutedMatch.matchedQuantity,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Escalate an unmatchable need to coordinators.
   */
  public async escalateNeed(needId: string, reason: string): Promise<AidNeedRecord> {
    const need = await matchingRepository.escalateNeedToCoordinator(needId, reason);

    const io = getIO();
    if (io) {
      io.to('coordinators:all').emit('need:escalated', {
        needId: need.id,
        aidType: need.aidType,
        quantity: need.quantityRequired,
        reason,
      });
      io.to('responders:all').emit('need:escalated', {
        needId: need.id,
        reason,
      });
    }

    return need;
  }
}

export const matchingService = new MatchingService();
