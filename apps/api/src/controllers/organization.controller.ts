import { Request, Response, NextFunction } from 'express';
import {
  RegisterOrganizationSchema,
  ApproveOrganizationSchema,
  RejectOrganizationSchema,
  AddOrganizationMemberSchema,
} from '@relieflink/shared';
import { organizationService } from '../services/organization.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export class OrganizationController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      const validated = RegisterOrganizationSchema.parse(req.body);
      const result = await organizationService.registerOrganization(
        req.user.userId,
        validated,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        message: 'Organization registered successfully and submitted for admin verification.',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isVerified =
        req.query.isVerified !== undefined ? req.query.isVerified === 'true' : undefined;
      const orgs = await organizationService.listOrganizations(isVerified);

      res.status(200).json({
        success: true,
        data: orgs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getPending(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgs = await organizationService.getPendingOrganizations();

      res.status(200).json({
        success: true,
        data: orgs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const result = await organizationService.getOrganization(orgId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      const orgId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = ApproveOrganizationSchema.parse(req.body);
      const org = await organizationService.approveOrganization(
        req.user.userId,
        orgId,
        validated,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        message: `Organization "${org.name}" has been approved and verified.`,
        data: org,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      const orgId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = RejectOrganizationSchema.parse(req.body);
      const org = await organizationService.rejectOrganization(
        req.user.userId,
        orgId,
        validated,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        message: `Organization "${org.name}" has been rejected.`,
        data: org,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();

      const orgId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
      const validated = AddOrganizationMemberSchema.parse(req.body);
      const result = await organizationService.addMember(req.user.userId, orgId, validated);

      res.status(200).json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const organizationController = new OrganizationController();
