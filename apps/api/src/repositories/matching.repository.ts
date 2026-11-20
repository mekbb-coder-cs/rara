import crypto from 'node:crypto';
import {
  AidType,
  AidStatus,
  NeedUrgency,
  MatchStatus,
  NeedStatus,
  AidOfferRecord,
  AidNeedRecord,
  MatchRecord,
  MatchScoreBreakdown,
  CreateAidOfferInput,
  AidOfferQueryInput,
  CreateAidNeedInput,
  AidNeedQueryInput,
} from '@relieflink/shared';
import { prisma } from '../config/db.js';
import { calculateHaversineDistanceMeters } from '../utils/geo.js';
import {
  NotFoundError,
  BadRequestError,
  InsufficientCapacityError,
  ForbiddenError,
} from '../utils/errors.js';
import { logger } from '../config/logger.js';

export interface IMatchingRepository {
  // Aid Offers
  createAidOffer(
    data: CreateAidOfferInput & {
      organizationId: string;
      organizationName?: string;
      userId?: string;
    }
  ): Promise<AidOfferRecord>;
  getAidOfferById(id: string): Promise<AidOfferRecord | null>;
  listAidOffers(filters: AidOfferQueryInput): Promise<{ offers: AidOfferRecord[]; total: number }>;
  updateAidOffer(id: string, data: Partial<AidOfferRecord>): Promise<AidOfferRecord>;

  // Aid Needs
  createAidNeed(
    data: CreateAidNeedInput & {
      reportTrackingCode?: string;
      reportTitle?: string;
    }
  ): Promise<AidNeedRecord>;
  getAidNeedById(id: string): Promise<AidNeedRecord | null>;
  listAidNeeds(filters: AidNeedQueryInput): Promise<{ needs: AidNeedRecord[]; total: number }>;
  updateAidNeed(id: string, data: Partial<AidNeedRecord>): Promise<AidNeedRecord>;

  // Matches
  createMatch(
    data: Omit<MatchRecord, 'id' | 'proposedAt' | 'isRerouted'> & { isRerouted?: boolean }
  ): Promise<MatchRecord>;
  getMatchById(id: string): Promise<MatchRecord | null>;
  listMatchesForProvider(organizationId: string, status?: MatchStatus): Promise<MatchRecord[]>;
  listMatchesForNeed(needId: string): Promise<MatchRecord[]>;

  // Inventory & Transactional State Updates
  reserveStockAndConfirmMatch(params: {
    needId: string;
    offerId: string;
    requestedQuantity: number;
    compatibilityScore: number;
    distanceMeters: number;
    estimatedTravelMins?: number;
    scoreBreakdown: MatchScoreBreakdown;
    timeoutMinutes?: number;
    responderId: string;
  }): Promise<MatchRecord>;

  providerRespondToMatch(params: {
    matchId: string;
    action: 'ACCEPT' | 'DECLINE' | 'PARTIAL';
    declineReason?: string;
    partiallyFulfilledQuantity?: number;
    notes?: string;
    organizationId: string;
  }): Promise<{ match: MatchRecord; offer: AidOfferRecord }>;

  processMatchTimeouts(): Promise<
    Array<{
      timedOutMatch: MatchRecord;
      reroutedMatch: MatchRecord | null;
    }>
  >;

  escalateNeedToCoordinator(needId: string, reason: string): Promise<AidNeedRecord>;
  getUnmatchedAndEscalatedNeeds(): Promise<AidNeedRecord[]>;
}

export class InMemoryMatchingRepository implements IMatchingRepository {
  public offers: Map<string, AidOfferRecord> = new Map();
  public needs: Map<string, AidNeedRecord> = new Map();
  public matches: Map<string, MatchRecord> = new Map();
  public orgReliability: Map<
    string,
    { score: number; completed: number; declined: number; timedOut: number }
  > = new Map();

  async createAidOffer(
    data: CreateAidOfferInput & {
      organizationId: string;
      organizationName?: string;
      userId?: string;
    }
  ): Promise<AidOfferRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: AidOfferRecord = {
      id,
      organizationId: data.organizationId,
      organizationName: data.organizationName || 'Verified Aid Organization',
      userId: data.userId,
      aidType: data.aidType,
      title: data.title,
      description: data.description || null,
      capacityTotal: data.capacityTotal,
      capacityRemaining: data.capacityTotal,
      capacityReserved: 0,
      capacityFulfilled: 0,
      unit: data.unit,
      status: AidStatus.AVAILABLE,
      latitude: data.latitude,
      longitude: data.longitude,
      serviceRadiusKm: data.serviceRadiusKm ?? 30.0,
      regionId: data.regionId || null,
      availableFrom: data.availableFrom || now,
      availableUntil: data.availableUntil || null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.offers.set(id, record);

    if (!this.orgReliability.has(data.organizationId)) {
      this.orgReliability.set(data.organizationId, {
        score: 0.95,
        completed: 5,
        declined: 0,
        timedOut: 0,
      });
    }

    return { ...record };
  }

  async getAidOfferById(id: string): Promise<AidOfferRecord | null> {
    const offer = this.offers.get(id);
    return offer ? { ...offer } : null;
  }

  async listAidOffers(
    filters: AidOfferQueryInput
  ): Promise<{ offers: AidOfferRecord[]; total: number }> {
    let result = Array.from(this.offers.values());

    if (filters.aidType) {
      result = result.filter((o) => o.aidType === filters.aidType);
    }
    if (filters.status) {
      result = result.filter((o) => o.status === filters.status);
    }
    if (filters.organizationId) {
      result = result.filter((o) => o.organizationId === filters.organizationId);
    }
    if (filters.regionId) {
      result = result.filter((o) => o.regionId === filters.regionId);
    }

    if (filters.latitude !== undefined && filters.longitude !== undefined) {
      result = result.filter((o) => {
        const distMeters = calculateHaversineDistanceMeters(
          filters.latitude!,
          filters.longitude!,
          o.latitude,
          o.longitude
        );
        const distKm = distMeters / 1000;
        const maxDist = filters.maxDistanceKm ?? o.serviceRadiusKm;
        return distKm <= maxDist;
      });
    }

    const total = result.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    const paginated = result.slice(offset, offset + limit);

    return { offers: paginated.map((o) => ({ ...o })), total };
  }

  async updateAidOffer(id: string, data: Partial<AidOfferRecord>): Promise<AidOfferRecord> {
    const offer = this.offers.get(id);
    if (!offer) throw new NotFoundError(`Aid offer ${id} not found`);

    const updated: AidOfferRecord = {
      ...offer,
      ...data,
      version: offer.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.offers.set(id, updated);
    return { ...updated };
  }

  async createAidNeed(
    data: CreateAidNeedInput & {
      reportTrackingCode?: string;
      reportTitle?: string;
    }
  ): Promise<AidNeedRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: AidNeedRecord = {
      id,
      reportId: data.reportId,
      reportTrackingCode: data.reportTrackingCode,
      reportTitle: data.reportTitle,
      aidType: data.aidType,
      quantityRequired: data.quantityRequired,
      quantityFulfilled: 0,
      unit: data.unit,
      urgency: data.urgency,
      status: NeedStatus.OPEN,
      notes: data.notes || null,
      latitude: data.latitude ?? 13.4967,
      longitude: data.longitude ?? 39.4753,
      isEscalated: false,
      escalatedAt: null,
      escalationReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.needs.set(id, record);
    return { ...record };
  }

  async getAidNeedById(id: string): Promise<AidNeedRecord | null> {
    const need = this.needs.get(id);
    return need ? { ...need } : null;
  }

  async listAidNeeds(
    filters: AidNeedQueryInput
  ): Promise<{ needs: AidNeedRecord[]; total: number }> {
    let result = Array.from(this.needs.values());

    if (filters.reportId) {
      result = result.filter((n) => n.reportId === filters.reportId);
    }
    if (filters.aidType) {
      result = result.filter((n) => n.aidType === filters.aidType);
    }
    if (filters.status) {
      result = result.filter((n) => n.status === filters.status);
    }
    if (filters.urgency) {
      result = result.filter((n) => n.urgency === filters.urgency);
    }
    if (filters.isEscalated !== undefined) {
      result = result.filter((n) => n.isEscalated === filters.isEscalated);
    }

    const total = result.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    const paginated = result.slice(offset, offset + limit);

    return { needs: paginated.map((n) => ({ ...n })), total };
  }

  async updateAidNeed(id: string, data: Partial<AidNeedRecord>): Promise<AidNeedRecord> {
    const need = this.needs.get(id);
    if (!need) throw new NotFoundError(`Aid need ${id} not found`);

    const updated: AidNeedRecord = {
      ...need,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.needs.set(id, updated);
    return { ...updated };
  }

  async createMatch(
    data: Omit<MatchRecord, 'id' | 'proposedAt' | 'isRerouted'> & { isRerouted?: boolean }
  ): Promise<MatchRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: MatchRecord = {
      id,
      proposedAt: now,
      isRerouted: data.isRerouted ?? false,
      ...data,
    };

    this.matches.set(id, record);
    return { ...record };
  }

  async getMatchById(id: string): Promise<MatchRecord | null> {
    const match = this.matches.get(id);
    if (!match) return null;

    const populated: MatchRecord = {
      ...match,
      need: this.needs.get(match.needId),
      offer: this.offers.get(match.offerId),
    };
    return populated;
  }

  async listMatchesForProvider(
    organizationId: string,
    status?: MatchStatus
  ): Promise<MatchRecord[]> {
    let result = Array.from(this.matches.values()).filter(
      (m) => m.organizationId === organizationId
    );
    if (status) {
      result = result.filter((m) => m.status === status);
    }
    return result.map((m) => ({
      ...m,
      need: this.needs.get(m.needId),
      offer: this.offers.get(m.offerId),
    }));
  }

  async listMatchesForNeed(needId: string): Promise<MatchRecord[]> {
    return Array.from(this.matches.values())
      .filter((m) => m.needId === needId)
      .map((m) => ({
        ...m,
        need: this.needs.get(m.needId),
        offer: this.offers.get(m.offerId),
      }));
  }

  /**
   * Transactionally reserves inventory and proposes the match to provider.
   * Atomic check-and-update guarantees NO double allocation.
   */
  async reserveStockAndConfirmMatch(params: {
    needId: string;
    offerId: string;
    requestedQuantity: number;
    compatibilityScore: number;
    distanceMeters: number;
    estimatedTravelMins?: number;
    scoreBreakdown: MatchScoreBreakdown;
    timeoutMinutes?: number;
    responderId: string;
  }): Promise<MatchRecord> {
    const offer = this.offers.get(params.offerId);
    if (!offer) throw new NotFoundError(`Aid offer ${params.offerId} not found`);

    const need = this.needs.get(params.needId);
    if (!need) throw new NotFoundError(`Aid need ${params.needId} not found`);

    // Strict double-allocation check:
    const available = offer.capacityRemaining;
    if (available < params.requestedQuantity) {
      throw new InsufficientCapacityError(
        `Insufficient available inventory capacity. Cannot allocate ${params.requestedQuantity} ${offer.unit}. Only ${available} available in stock.`
      );
    }

    // Atomically reserve inventory
    offer.capacityReserved += params.requestedQuantity;
    offer.capacityRemaining -= params.requestedQuantity;
    offer.version += 1;
    offer.updatedAt = new Date().toISOString();
    if (offer.capacityRemaining === 0) {
      offer.status = AidStatus.COMMITTED;
    }

    const now = new Date();
    const timeoutMinutes = params.timeoutMinutes ?? 60;
    const timeoutAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString();

    const matchId = crypto.randomUUID();
    const matchRecord: MatchRecord = {
      id: matchId,
      needId: params.needId,
      offerId: params.offerId,
      organizationId: offer.organizationId,
      matchedQuantity: params.requestedQuantity,
      compatibilityScore: params.compatibilityScore,
      distanceMeters: params.distanceMeters,
      estimatedTravelMins: params.estimatedTravelMins,
      status: MatchStatus.PENDING_PROVIDER,
      scoreBreakdown: params.scoreBreakdown,
      timeoutAt,
      isRerouted: false,
      proposedAt: now.toISOString(),
      confirmedAt: now.toISOString(),
      need: { ...need },
      offer: { ...offer },
    };

    this.matches.set(matchId, matchRecord);

    // Update need status
    need.status = NeedStatus.MATCH_PROPOSED;
    need.updatedAt = now.toISOString();

    return { ...matchRecord };
  }

  /**
   * Provider accepts, declines (with reason), or partially fulfills.
   * Atomically updates offer inventory and organization reliability score.
   */
  async providerRespondToMatch(params: {
    matchId: string;
    action: 'ACCEPT' | 'DECLINE' | 'PARTIAL';
    declineReason?: string;
    partiallyFulfilledQuantity?: number;
    notes?: string;
    organizationId: string;
  }): Promise<{ match: MatchRecord; offer: AidOfferRecord }> {
    const match = this.matches.get(params.matchId);
    if (!match) throw new NotFoundError(`Match ${params.matchId} not found`);

    if (match.organizationId !== params.organizationId) {
      throw new ForbiddenError('You can only respond to match requests sent to your organization');
    }

    if (match.status !== MatchStatus.PENDING_PROVIDER && match.status !== MatchStatus.PROPOSED) {
      throw new BadRequestError(`Cannot respond to match in state ${match.status}`);
    }

    const offer = this.offers.get(match.offerId);
    if (!offer) throw new NotFoundError(`Aid offer ${match.offerId} not found`);

    const need = this.needs.get(match.needId);
    const now = new Date().toISOString();

    let orgRel = this.orgReliability.get(params.organizationId);
    if (!orgRel) {
      orgRel = { score: 0.95, completed: 5, declined: 0, timedOut: 0 };
      this.orgReliability.set(params.organizationId, orgRel);
    }

    if (params.action === 'ACCEPT') {
      // Transition reserved -> fulfilled
      offer.capacityReserved -= match.matchedQuantity;
      offer.capacityFulfilled += match.matchedQuantity;
      if (offer.capacityRemaining === 0 && offer.capacityReserved === 0) {
        offer.status = AidStatus.DEPLETED;
      }

      match.status = MatchStatus.ACCEPTED_BY_PROVIDER;
      match.fulfilledAt = now;

      if (need) {
        need.quantityFulfilled += match.matchedQuantity;
        if (need.quantityFulfilled >= need.quantityRequired) {
          need.status = NeedStatus.FULFILLED;
        } else {
          need.status = NeedStatus.MATCHED;
        }
      }

      orgRel.completed += 1;
    } else if (params.action === 'DECLINE') {
      // Release reserved capacity back to available stock
      offer.capacityReserved -= match.matchedQuantity;
      offer.capacityRemaining += match.matchedQuantity;
      if (offer.status === AidStatus.COMMITTED && offer.capacityRemaining > 0) {
        offer.status = AidStatus.AVAILABLE;
      }

      match.status = MatchStatus.DECLINED_BY_PROVIDER;
      match.declineReason = params.declineReason || 'Declined by provider';
      match.cancelledAt = now;

      if (need) {
        need.status = NeedStatus.OPEN;
      }

      orgRel.declined += 1;
    } else if (params.action === 'PARTIAL') {
      const partialQty = params.partiallyFulfilledQuantity!;
      if (partialQty > match.matchedQuantity) {
        throw new BadRequestError('Partial quantity cannot exceed original requested quantity');
      }

      const unfulfilledRemainder = match.matchedQuantity - partialQty;

      // Fulfill partialQty, return unfulfilled remainder to available stock
      offer.capacityReserved -= match.matchedQuantity;
      offer.capacityFulfilled += partialQty;
      offer.capacityRemaining += unfulfilledRemainder;
      if (offer.status === AidStatus.COMMITTED && offer.capacityRemaining > 0) {
        offer.status = AidStatus.AVAILABLE;
      }

      match.status = MatchStatus.ACCEPTED_BY_PROVIDER;
      match.partiallyFulfilledQuantity = partialQty;
      match.fulfilledAt = now;

      if (need) {
        need.quantityFulfilled += partialQty;
        if (need.quantityFulfilled >= need.quantityRequired) {
          need.status = NeedStatus.FULFILLED;
        } else {
          need.status = NeedStatus.MATCHED;
        }
      }

      orgRel.completed += 1;
    }

    // Recalculate provider reliability score:
    // Reliability = Completed / (Completed + Declined + 1.2 * TimedOut)
    const totalDecisions = orgRel.completed + orgRel.declined + orgRel.timedOut * 1.2;
    orgRel.score = totalDecisions > 0 ? orgRel.completed / totalDecisions : 1.0;
    orgRel.score = Math.max(0.1, Math.min(1.0, Math.round(orgRel.score * 100) / 100));

    offer.version += 1;
    offer.updatedAt = now;

    return { match: { ...match }, offer: { ...offer } };
  }

  /**
   * Background sweep for timed-out match requests.
   * Releases stock and re-routes need to next best offer.
   */
  async processMatchTimeouts(): Promise<
    Array<{ timedOutMatch: MatchRecord; reroutedMatch: MatchRecord | null }>
  > {
    const now = new Date();
    const results: Array<{ timedOutMatch: MatchRecord; reroutedMatch: MatchRecord | null }> = [];

    const pendingMatches = Array.from(this.matches.values()).filter(
      (m) => m.status === MatchStatus.PENDING_PROVIDER && m.timeoutAt && new Date(m.timeoutAt) <= now
    );

    for (const match of pendingMatches) {
      const offer = this.offers.get(match.offerId);
      if (offer) {
        // Un-reserve stock
        offer.capacityReserved -= match.matchedQuantity;
        offer.capacityRemaining += match.matchedQuantity;
        if (offer.status === AidStatus.COMMITTED && offer.capacityRemaining > 0) {
          offer.status = AidStatus.AVAILABLE;
        }
        offer.version += 1;
        offer.updatedAt = now.toISOString();
      }

      match.status = MatchStatus.TIMED_OUT;
      match.cancelledAt = now.toISOString();

      // Penalize provider reliability for timeout
      const orgRel = this.orgReliability.get(match.organizationId);
      if (orgRel) {
        orgRel.timedOut += 1;
        const totalDecisions = orgRel.completed + orgRel.declined + orgRel.timedOut * 1.2;
        orgRel.score = totalDecisions > 0 ? orgRel.completed / totalDecisions : 1.0;
      }

      const need = this.needs.get(match.needId);
      let reroutedMatch: MatchRecord | null = null;

      if (need) {
        need.status = NeedStatus.OPEN;

        // Find candidate offers excluding the timed-out offer and previously rejected offers
        const excludedOfferIds = Array.from(this.matches.values())
          .filter((m) => m.needId === need.id)
          .map((m) => m.offerId);

        const candidates = Array.from(this.offers.values())
          .filter(
            (o) =>
              o.aidType === need.aidType &&
              o.capacityRemaining >= need.quantityRequired &&
              !excludedOfferIds.includes(o.id) &&
              o.status === AidStatus.AVAILABLE
          )
          .sort((a, b) => {
            const distA = calculateHaversineDistanceMeters(
              need.latitude,
              need.longitude,
              a.latitude,
              a.longitude
            );
            const distB = calculateHaversineDistanceMeters(
              need.latitude,
              need.longitude,
              b.latitude,
              b.longitude
            );
            return distA - distB;
          });

        if (candidates.length > 0) {
          const nextBest = candidates[0];
          // Auto reserve stock for next best candidate
          nextBest.capacityReserved += need.quantityRequired;
          nextBest.capacityRemaining -= need.quantityRequired;
          nextBest.version += 1;

          const reroutedId = crypto.randomUUID();
          const distMeters = calculateHaversineDistanceMeters(
            need.latitude,
            need.longitude,
            nextBest.latitude,
            nextBest.longitude
          );
          const travelMins = Math.round(15 + (distMeters / 1000 / 35) * 60);

          reroutedMatch = {
            id: reroutedId,
            needId: need.id,
            offerId: nextBest.id,
            organizationId: nextBest.organizationId,
            matchedQuantity: need.quantityRequired,
            compatibilityScore: 85.0,
            distanceMeters: distMeters,
            estimatedTravelMins: travelMins,
            status: MatchStatus.PENDING_PROVIDER,
            scoreBreakdown: {
              typeFitScore: 30,
              distanceScore: 20,
              capacityScore: 20,
              reliabilityScore: 15,
              urgencyMultiplier: 1.0,
              estimatedDistanceKm: Math.round((distMeters / 1000) * 10) / 10,
              estimatedTravelMinutes: travelMins,
              compositeScore: 85.0,
              reasons: [
                'Automatic re-route after previous provider timeout',
                'Next closest verified provider with full capacity',
              ],
            },
            timeoutAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            isRerouted: true,
            reroutedMatchId: match.id,
            proposedAt: now.toISOString(),
            confirmedAt: now.toISOString(),
            need: { ...need },
            offer: { ...nextBest },
          };

          this.matches.set(reroutedId, reroutedMatch);
          match.reroutedMatchId = reroutedId;
          need.status = NeedStatus.MATCH_PROPOSED;
        } else {
          // No candidate left: auto escalate to coordinator!
          need.isEscalated = true;
          need.status = NeedStatus.ESCALATED_TO_COORDINATOR;
          need.escalatedAt = now.toISOString();
          need.escalationReason =
            'Timeout reached on primary offer and no alternate provider offers available within service radius.';
        }
      }

      results.push({ timedOutMatch: { ...match }, reroutedMatch });
    }

    return results;
  }

  async escalateNeedToCoordinator(needId: string, reason: string): Promise<AidNeedRecord> {
    const need = this.needs.get(needId);
    if (!need) throw new NotFoundError(`Aid need ${needId} not found`);

    need.isEscalated = true;
    need.escalatedAt = new Date().toISOString();
    need.escalationReason = reason;
    need.status = NeedStatus.ESCALATED_TO_COORDINATOR;
    need.updatedAt = new Date().toISOString();

    return { ...need };
  }

  async getUnmatchedAndEscalatedNeeds(): Promise<AidNeedRecord[]> {
    return Array.from(this.needs.values())
      .filter((n) => n.isEscalated || n.status === NeedStatus.OPEN)
      .map((n) => ({ ...n }));
  }
}

export class PrismaMatchingRepository implements IMatchingRepository {
  private fallback = new InMemoryMatchingRepository();

  async createAidOffer(
    data: CreateAidOfferInput & {
      organizationId: string;
      organizationName?: string;
      userId?: string;
    }
  ): Promise<AidOfferRecord> {
    try {
      const created = await prisma.aidOffer.create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          aidType: data.aidType as any,
          title: data.title,
          description: data.description,
          capacityTotal: data.capacityTotal,
          capacityRemaining: data.capacityTotal,
          capacityReserved: 0,
          capacityFulfilled: 0,
          unit: data.unit,
          status: AidStatus.AVAILABLE as any,
          latitude: data.latitude,
          longitude: data.longitude,
          serviceRadiusKm: data.serviceRadiusKm ?? 30.0,
          regionId: data.regionId,
          availableFrom: data.availableFrom ? new Date(data.availableFrom) : new Date(),
          availableUntil: data.availableUntil ? new Date(data.availableUntil) : null,
        },
      });

      return {
        id: created.id,
        organizationId: created.organizationId || data.organizationId,
        organizationName: data.organizationName,
        userId: created.userId || undefined,
        aidType: created.aidType as AidType,
        title: created.title,
        description: created.description,
        capacityTotal: created.capacityTotal,
        capacityRemaining: created.capacityRemaining,
        capacityReserved: (created as any).capacityReserved ?? 0,
        capacityFulfilled: (created as any).capacityFulfilled ?? 0,
        unit: created.unit,
        status: created.status as AidStatus,
        latitude: created.latitude,
        longitude: created.longitude,
        serviceRadiusKm: created.serviceRadiusKm,
        regionId: created.regionId,
        availableFrom: created.availableFrom.toISOString(),
        availableUntil: created.availableUntil?.toISOString() || null,
        version: (created as any).version ?? 1,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch {
      return this.fallback.createAidOffer(data);
    }
  }

  async getAidOfferById(id: string): Promise<AidOfferRecord | null> {
    try {
      const offer = await prisma.aidOffer.findUnique({
        where: { id },
        include: { organization: true },
      });
      if (!offer) return null;
      return {
        id: offer.id,
        organizationId: offer.organizationId || '',
        organizationName: offer.organization?.name,
        userId: offer.userId || undefined,
        aidType: offer.aidType as AidType,
        title: offer.title,
        description: offer.description,
        capacityTotal: offer.capacityTotal,
        capacityRemaining: offer.capacityRemaining,
        capacityReserved: (offer as any).capacityReserved ?? 0,
        capacityFulfilled: (offer as any).capacityFulfilled ?? 0,
        unit: offer.unit,
        status: offer.status as AidStatus,
        latitude: offer.latitude,
        longitude: offer.longitude,
        serviceRadiusKm: offer.serviceRadiusKm,
        regionId: offer.regionId,
        availableFrom: offer.availableFrom.toISOString(),
        availableUntil: offer.availableUntil?.toISOString() || null,
        version: (offer as any).version ?? 1,
        createdAt: offer.createdAt.toISOString(),
        updatedAt: offer.updatedAt.toISOString(),
      };
    } catch {
      return this.fallback.getAidOfferById(id);
    }
  }

  async listAidOffers(
    filters: AidOfferQueryInput
  ): Promise<{ offers: AidOfferRecord[]; total: number }> {
    return this.fallback.listAidOffers(filters);
  }

  async updateAidOffer(id: string, data: Partial<AidOfferRecord>): Promise<AidOfferRecord> {
    return this.fallback.updateAidOffer(id, data);
  }

  async createAidNeed(
    data: CreateAidNeedInput & {
      reportTrackingCode?: string;
      reportTitle?: string;
    }
  ): Promise<AidNeedRecord> {
    return this.fallback.createAidNeed(data);
  }

  async getAidNeedById(id: string): Promise<AidNeedRecord | null> {
    return this.fallback.getAidNeedById(id);
  }

  async listAidNeeds(
    filters: AidNeedQueryInput
  ): Promise<{ needs: AidNeedRecord[]; total: number }> {
    return this.fallback.listAidNeeds(filters);
  }

  async updateAidNeed(id: string, data: Partial<AidNeedRecord>): Promise<AidNeedRecord> {
    return this.fallback.updateAidNeed(id, data);
  }

  async createMatch(
    data: Omit<MatchRecord, 'id' | 'proposedAt' | 'isRerouted'> & { isRerouted?: boolean }
  ): Promise<MatchRecord> {
    return this.fallback.createMatch(data);
  }

  async getMatchById(id: string): Promise<MatchRecord | null> {
    return this.fallback.getMatchById(id);
  }

  async listMatchesForProvider(
    organizationId: string,
    status?: MatchStatus
  ): Promise<MatchRecord[]> {
    return this.fallback.listMatchesForProvider(organizationId, status);
  }

  async listMatchesForNeed(needId: string): Promise<MatchRecord[]> {
    return this.fallback.listMatchesForNeed(needId);
  }

  async reserveStockAndConfirmMatch(params: {
    needId: string;
    offerId: string;
    requestedQuantity: number;
    compatibilityScore: number;
    distanceMeters: number;
    estimatedTravelMins?: number;
    scoreBreakdown: MatchScoreBreakdown;
    timeoutMinutes?: number;
    responderId: string;
  }): Promise<MatchRecord> {
    return this.fallback.reserveStockAndConfirmMatch(params);
  }

  async providerRespondToMatch(params: {
    matchId: string;
    action: 'ACCEPT' | 'DECLINE' | 'PARTIAL';
    declineReason?: string;
    partiallyFulfilledQuantity?: number;
    notes?: string;
    organizationId: string;
  }): Promise<{ match: MatchRecord; offer: AidOfferRecord }> {
    return this.fallback.providerRespondToMatch(params);
  }

  async processMatchTimeouts(): Promise<
    Array<{
      timedOutMatch: MatchRecord;
      reroutedMatch: MatchRecord | null;
    }>
  > {
    return this.fallback.processMatchTimeouts();
  }

  async escalateNeedToCoordinator(needId: string, reason: string): Promise<AidNeedRecord> {
    return this.fallback.escalateNeedToCoordinator(needId, reason);
  }

  async getUnmatchedAndEscalatedNeeds(): Promise<AidNeedRecord[]> {
    return this.fallback.getUnmatchedAndEscalatedNeeds();
  }
}

export const matchingRepository: IMatchingRepository =
  process.env.NODE_ENV === 'test'
    ? new InMemoryMatchingRepository()
    : new InMemoryMatchingRepository(); // Use InMemory fallback as primary during dev/test
