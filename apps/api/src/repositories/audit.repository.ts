import { AuditAction, Role } from '@relieflink/shared';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';

export interface AuditLogRecord {
  id: string;
  userId: string | null;
  userRole: Role | null;
  action: AuditAction;
  entityName: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}

export interface IAuditRepository {
  createLog(data: {
    userId?: string;
    userRole?: Role;
    action: AuditAction;
    entityName: string;
    entityId: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogRecord>;
  getLogs(filter?: {
    userId?: string;
    action?: AuditAction;
    entityName?: string;
    limit?: number;
  }): Promise<AuditLogRecord[]>;
  getLogsByEntity(entityName: string, entityId: string): Promise<AuditLogRecord[]>;
}

export class InMemoryAuditRepository implements IAuditRepository {
  public logs: AuditLogRecord[] = [];

  async getLogsByEntity(entityName: string, entityId: string): Promise<AuditLogRecord[]> {
    return this.logs.filter((l) => l.entityName === entityName && l.entityId === entityId);
  }

  async createLog(data: {
    userId?: string;
    userRole?: Role;
    action: AuditAction;
    entityName: string;
    entityId: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: crypto.randomUUID(),
      userId: data.userId || null,
      userRole: data.userRole || null,
      action: data.action,
      entityName: data.entityName,
      entityId: data.entityId,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      metadata: data.metadata || null,
      timestamp: new Date(),
    };
    this.logs.unshift(record);
    logger.debug({ audit: record }, 'Audit log recorded (in-memory)');
    return record;
  }

  async getLogs(filter?: {
    userId?: string;
    action?: AuditAction;
    entityName?: string;
    limit?: number;
  }): Promise<AuditLogRecord[]> {
    let result = [...this.logs];
    if (filter?.userId) result = result.filter((l) => l.userId === filter.userId);
    if (filter?.action) result = result.filter((l) => l.action === filter.action);
    if (filter?.entityName) result = result.filter((l) => l.entityName === filter.entityName);
    if (filter?.limit) result = result.slice(0, filter.limit);
    return result;
  }
}

export class PrismaAuditRepository implements IAuditRepository {
  async createLog(data: {
    userId?: string;
    userRole?: Role;
    action: AuditAction;
    entityName: string;
    entityId: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogRecord> {
    const log = await prisma.auditLog.create({
      data: {
        userId: data.userId,
        userRole: data.userRole as any,
        action: data.action as any,
        entityName: data.entityName,
        entityId: data.entityId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata as any,
      },
    });
    return log as unknown as AuditLogRecord;
  }

  async getLogs(filter?: {
    userId?: string;
    action?: AuditAction;
    entityName?: string;
    limit?: number;
  }): Promise<AuditLogRecord[]> {
    const where: any = {};
    if (filter?.userId) where.userId = filter.userId;
    if (filter?.action) where.action = filter.action as any;
    if (filter?.entityName) where.entityName = filter.entityName;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filter?.limit || 100,
    });
    return logs as unknown as AuditLogRecord[];
  }

  async getLogsByEntity(entityName: string, entityId: string): Promise<AuditLogRecord[]> {
    const logs = await prisma.auditLog.findMany({
      where: { entityName, entityId },
      orderBy: { timestamp: 'desc' },
    });
    return logs as unknown as AuditLogRecord[];
  }
}

export const auditRepository: IAuditRepository =
  process.env.NODE_ENV === 'test' ? new InMemoryAuditRepository() : new PrismaAuditRepository();
