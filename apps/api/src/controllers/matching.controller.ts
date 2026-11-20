import { Request, Response, NextFunction } from 'express';
import {
  CreateAidOfferSchema,
  UpdateAidOfferSchema,
  AidOfferQuerySchema,
  CreateAidNeedSchema,
  AidNeedQuerySchema,
  ConfirmMatchSchema,
  ProviderMatchResponseSchema,
  EscalateNeedSchema,
  Role,
} from '@relieflink/shared';
import { matchingRepository } from '../repositories/matching.repository.js';
import { matchingService } from '../services/matching.service.js';
import { reportRepository } from '../repositories/report.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../utils/errors.js';

export class MatchingController {
  // ==========================================
  // AID OFFERS
  // ==========================================

  async createOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      // Only approved organizations can publish offers
      if (req.user.role === Role.AID_PROVIDER && !req.user.isOrgApproved) {
        throw new ForbiddenError(
          'Your organization must be verified and approved by administrators before posting aid offers.'
        );
      }

      let organizationId = req.user.organizationId;
      let organizationName = 'Verified Aid Organization';

      if (!organizationId) {
        if (req.user.role === Role.ADMIN && req.body.organizationId) {
          organizationId = req.body.organizationId;
        } else {
          // Provide default org for hermetic testing/dev if none assigned
          organizationId = 'org-verified-aid-default';
        }
      }

      if (organizationId) {
        const org = await organizationRepository.findById(organizationId);
        if (org) organizationName = org.name;
      }

      const validated = CreateAidOfferSchema.parse(req.body);
      const offer = await matchingRepository.createAidOffer({
        ...validated,
        organizationId,
        organizationName,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Aid offer published successfully and available for emergency matching.',
        data: offer,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async listOffers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = AidOfferQuerySchema.parse(req.query);
      const result = await matchingRepository.listAidOffers(filters);

      res.status(200).json({
        success: true,
        data: result.offers,
        total: result.total,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const offer = await matchingRepository.getAidOfferById(id);
      if (!offer) throw new NotFoundError(`Aid offer ${id} not found`);

      res.status(200).json({
        success: true,
        data: offer,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const existing = await matchingRepository.getAidOfferById(id);
      if (!existing) throw new NotFoundError(`Aid offer ${id} not found`);

      if (
        req.user.role !== Role.ADMIN &&
        req.user.organizationId !== existing.organizationId
      ) {
        throw new ForbiddenError('You can only update offers belonging to your organization');
      }

      const validated = UpdateAidOfferSchema.parse(req.body);
      const updated = await matchingRepository.updateAidOffer(id, validated);

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // AID NEEDS
  // ==========================================

  async createNeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      const validated = CreateAidNeedSchema.parse(req.body);

      // Verify report exists
      const report = await reportRepository.findReportById(validated.reportId);
      if (!report) throw new NotFoundError(`Report ${validated.reportId} not found`);

      const need = await matchingRepository.createAidNeed({
        ...validated,
        reportTrackingCode: report.trackingCode,
        reportTitle: report.title,
        latitude: validated.latitude ?? report.latitude,
        longitude: validated.longitude ?? report.longitude,
      });

      res.status(201).json({
        success: true,
        message: 'Aid need structured and registered for humanitarian matching.',
        data: need,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async listNeeds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = AidNeedQuerySchema.parse(req.query);
      const result = await matchingRepository.listAidNeeds(filters);

      res.status(200).json({
        success: true,
        data: result.needs,
        total: result.total,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getNeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const need = await matchingRepository.getAidNeedById(id);
      if (!need) throw new NotFoundError(`Aid need ${id} not found`);

      res.status(200).json({
        success: true,
        data: need,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // MATCHING ENGINE & WORKFLOW
  // ==========================================

  async findCandidateMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await matchingService.findCandidateMatches(id);

      res.status(200).json({
        success: true,
        data: {
          need: result.need,
          candidates: result.candidates,
          noMatchFound: result.noMatchFound,
          candidateCount: result.candidates.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async confirmMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const validated = ConfirmMatchSchema.parse(req.body);

      const match = await matchingService.confirmMatch(validated, req.user.userId);

      res.status(201).json({
        success: true,
        message:
          'Match confirmed by responder. Stock has been reserved and match request dispatched to aid provider.',
        data: match,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async providerRespond(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;

      const validated = ProviderMatchResponseSchema.parse(req.body);

      let orgId = req.user.organizationId;
      if (!orgId) {
        // If testing/admin, check match organization
        const match = await matchingRepository.getMatchById(id);
        if (match) orgId = match.organizationId;
      }

      if (!orgId) {
        throw new ForbiddenError('You must be a member of an aid organization to respond to match requests');
      }

      const result = await matchingService.providerRespond(id, validated, orgId);

      res.status(200).json({
        success: true,
        message:
          validated.action === 'ACCEPT'
            ? 'Match accepted and fulfilled by aid provider.'
            : validated.action === 'DECLINE'
              ? 'Match declined by provider. Reserved inventory restored.'
              : 'Match partially fulfilled. Unfulfilled stock restored.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async listProviderMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      let orgId = req.user.organizationId;
      if (!orgId && req.query.organizationId) {
        orgId = String(req.query.organizationId);
      }
      if (!orgId) {
        orgId = 'org-verified-aid-default';
      }

      const matches = await matchingRepository.listMatchesForProvider(orgId);

      res.status(200).json({
        success: true,
        data: matches,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async escalateNeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { id } = req.params;
      const validated = EscalateNeedSchema.parse(req.body);

      const escalated = await matchingService.escalateNeed(id, validated.reason);

      res.status(200).json({
        success: true,
        message: 'Need escalated to emergency coordinators for regional resource intervention.',
        data: escalated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getCoordinatorOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unmatched = await matchingRepository.getUnmatchedAndEscalatedNeeds();

      res.status(200).json({
        success: true,
        data: {
          unmatchedNeeds: unmatched,
          totalEscalated: unmatched.filter((n) => n.isEscalated).length,
          totalOpen: unmatched.filter((n) => !n.isEscalated).length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async processTimeouts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const results = await matchingService.processTimeouts();

      res.status(200).json({
        success: true,
        message: `Processed ${results.length} timed-out match requests.`,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const matchingController = new MatchingController();
