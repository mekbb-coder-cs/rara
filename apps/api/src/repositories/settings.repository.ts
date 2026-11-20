import {
  SystemConfig,
  PriorityWeightsConfig,
  DuplicateClusteringConfig,
  EscalationThresholdsConfig,
  DataRetentionConfig,
  AuditAction,
  Role,
} from '@relieflink/shared';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';
import { auditRepository } from './audit.repository.js';

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  priorityWeights: {
    weightSeverity: 3.5,
    weightPeople: 2.5,
    weightVulnerability: 2.5,
    weightWaitingTime: 1.5,
  },
  duplicateClustering: {
    radiusMeters: 500,
    timeWindowMinutes: 60,
    textSimilarityThreshold: 0.75,
  },
  escalationThresholds: {
    defaultUnverifiedMinutes: 30,
    defaultUnmatchedMinutes: 60,
  },
  featureFlags: {
    ENABLE_VOLUNTEER_TRACKING: true,
    ENABLE_SMS_NOTIFICATIONS: true,
    ENABLE_AUTOMATIC_ESCALATIONS: true,
    DATA_RETENTION_AUTO_ANONYMIZE: true,
    MAINTENANCE_MODE: false,
  },
  dataRetention: {
    retentionDays: 30,
    autoAnonymizeEnabled: true,
  },
};

export interface ISettingsRepository {
  getConfig(): Promise<SystemConfig>;
  updatePriorityWeights(
    weights: PriorityWeightsConfig,
    userId?: string,
    userRole?: Role
  ): Promise<PriorityWeightsConfig>;
  updateDuplicateClustering(
    config: DuplicateClusteringConfig,
    userId?: string,
    userRole?: Role
  ): Promise<DuplicateClusteringConfig>;
  updateEscalationThresholds(
    thresholds: EscalationThresholdsConfig,
    userId?: string,
    userRole?: Role
  ): Promise<EscalationThresholdsConfig>;
  updateFeatureFlags(
    flags: Record<string, boolean>,
    userId?: string,
    userRole?: Role
  ): Promise<Record<string, boolean>>;
  updateDataRetention(
    config: DataRetentionConfig,
    userId?: string,
    userRole?: Role
  ): Promise<DataRetentionConfig>;
}

export class InMemorySettingsRepository implements ISettingsRepository {
  public config: SystemConfig = JSON.parse(JSON.stringify(DEFAULT_SYSTEM_CONFIG));

  async getConfig(): Promise<SystemConfig> {
    return JSON.parse(JSON.stringify(this.config));
  }

  async updatePriorityWeights(
    weights: PriorityWeightsConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<PriorityWeightsConfig> {
    const before = { ...this.config.priorityWeights };
    this.config.priorityWeights = { ...weights };
    const after = { ...this.config.priorityWeights };

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'priority_weights',
      metadata: { before, after },
    });

    logger.info({ before, after }, 'Priority weights updated in settings');
    return after;
  }

  async updateDuplicateClustering(
    config: DuplicateClusteringConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<DuplicateClusteringConfig> {
    const before = { ...this.config.duplicateClustering };
    this.config.duplicateClustering = { ...config };
    const after = { ...this.config.duplicateClustering };

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'duplicate_clustering',
      metadata: { before, after },
    });

    return after;
  }

  async updateEscalationThresholds(
    thresholds: EscalationThresholdsConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<EscalationThresholdsConfig> {
    const before = { ...this.config.escalationThresholds };
    this.config.escalationThresholds = { ...thresholds };
    const after = { ...this.config.escalationThresholds };

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'escalation_thresholds',
      metadata: { before, after },
    });

    return after;
  }

  async updateFeatureFlags(
    flags: Record<string, boolean>,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<Record<string, boolean>> {
    const before = { ...this.config.featureFlags };
    this.config.featureFlags = { ...this.config.featureFlags, ...flags };
    const after = { ...this.config.featureFlags };

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'feature_flags',
      metadata: { before, after },
    });

    return after;
  }

  async updateDataRetention(
    config: DataRetentionConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<DataRetentionConfig> {
    const before = { ...this.config.dataRetention };
    this.config.dataRetention = { ...config };
    const after = { ...this.config.dataRetention };

    await auditRepository.createLog({
      userId,
      userRole,
      action: AuditAction.SETTINGS_UPDATE,
      entityName: 'SystemSetting',
      entityId: 'data_retention',
      metadata: { before, after },
    });

    return after;
  }
}

export class PrismaSettingsRepository implements ISettingsRepository {
  private inMemoryFallback = new InMemorySettingsRepository();

  async getConfig(): Promise<SystemConfig> {
    try {
      const records = await prisma.systemSetting.findMany();
      if (!records || records.length === 0) {
        return this.inMemoryFallback.getConfig();
      }

      const config: SystemConfig = JSON.parse(JSON.stringify(DEFAULT_SYSTEM_CONFIG));
      for (const rec of records) {
        if (rec.key === 'priority_weights') config.priorityWeights = rec.value as any;
        if (rec.key === 'duplicate_clustering') config.duplicateClustering = rec.value as any;
        if (rec.key === 'escalation_thresholds') config.escalationThresholds = rec.value as any;
        if (rec.key === 'feature_flags') config.featureFlags = rec.value as any;
        if (rec.key === 'data_retention') config.dataRetention = rec.value as any;
      }
      return config;
    } catch {
      return this.inMemoryFallback.getConfig();
    }
  }

  async updatePriorityWeights(
    weights: PriorityWeightsConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<PriorityWeightsConfig> {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: 'priority_weights' },
      });
      const before = (existing?.value as any) || DEFAULT_SYSTEM_CONFIG.priorityWeights;

      await prisma.systemSetting.upsert({
        where: { key: 'priority_weights' },
        create: {
          key: 'priority_weights',
          value: weights as any,
          description: 'Priority score formula weight multipliers',
          updatedBy: userId,
        },
        update: {
          value: weights as any,
          updatedBy: userId,
        },
      });

      await auditRepository.createLog({
        userId,
        userRole,
        action: AuditAction.SETTINGS_UPDATE,
        entityName: 'SystemSetting',
        entityId: 'priority_weights',
        metadata: { before, after: weights },
      });

      return weights;
    } catch {
      return this.inMemoryFallback.updatePriorityWeights(weights, userId, userRole);
    }
  }

  async updateDuplicateClustering(
    config: DuplicateClusteringConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<DuplicateClusteringConfig> {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: 'duplicate_clustering' },
      });
      const before = (existing?.value as any) || DEFAULT_SYSTEM_CONFIG.duplicateClustering;

      await prisma.systemSetting.upsert({
        where: { key: 'duplicate_clustering' },
        create: {
          key: 'duplicate_clustering',
          value: config as any,
          description: 'Duplicate cluster radius and time window settings',
          updatedBy: userId,
        },
        update: {
          value: config as any,
          updatedBy: userId,
        },
      });

      await auditRepository.createLog({
        userId,
        userRole,
        action: AuditAction.SETTINGS_UPDATE,
        entityName: 'SystemSetting',
        entityId: 'duplicate_clustering',
        metadata: { before, after: config },
      });

      return config;
    } catch {
      return this.inMemoryFallback.updateDuplicateClustering(config, userId, userRole);
    }
  }

  async updateEscalationThresholds(
    thresholds: EscalationThresholdsConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<EscalationThresholdsConfig> {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: 'escalation_thresholds' },
      });
      const before = (existing?.value as any) || DEFAULT_SYSTEM_CONFIG.escalationThresholds;

      await prisma.systemSetting.upsert({
        where: { key: 'escalation_thresholds' },
        create: {
          key: 'escalation_thresholds',
          value: thresholds as any,
          description: 'Regional escalation alert SLA thresholds in minutes',
          updatedBy: userId,
        },
        update: {
          value: thresholds as any,
          updatedBy: userId,
        },
      });

      await auditRepository.createLog({
        userId,
        userRole,
        action: AuditAction.SETTINGS_UPDATE,
        entityName: 'SystemSetting',
        entityId: 'escalation_thresholds',
        metadata: { before, after: thresholds },
      });

      return thresholds;
    } catch {
      return this.inMemoryFallback.updateEscalationThresholds(thresholds, userId, userRole);
    }
  }

  async updateFeatureFlags(
    flags: Record<string, boolean>,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<Record<string, boolean>> {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: 'feature_flags' },
      });
      const before = (existing?.value as any) || DEFAULT_SYSTEM_CONFIG.featureFlags;
      const combined = { ...before, ...flags };

      await prisma.systemSetting.upsert({
        where: { key: 'feature_flags' },
        create: {
          key: 'feature_flags',
          value: combined as any,
          description: 'Global system and platform feature flags',
          updatedBy: userId,
        },
        update: {
          value: combined as any,
          updatedBy: userId,
        },
      });

      await auditRepository.createLog({
        userId,
        userRole,
        action: AuditAction.SETTINGS_UPDATE,
        entityName: 'SystemSetting',
        entityId: 'feature_flags',
        metadata: { before, after: combined },
      });

      return combined;
    } catch {
      return this.inMemoryFallback.updateFeatureFlags(flags, userId, userRole);
    }
  }

  async updateDataRetention(
    config: DataRetentionConfig,
    userId = 'admin-system',
    userRole = Role.ADMIN
  ): Promise<DataRetentionConfig> {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: 'data_retention' },
      });
      const before = (existing?.value as any) || DEFAULT_SYSTEM_CONFIG.dataRetention;

      await prisma.systemSetting.upsert({
        where: { key: 'data_retention' },
        create: {
          key: 'data_retention',
          value: config as any,
          description: 'Data retention and privacy policy settings',
          updatedBy: userId,
        },
        update: {
          value: config as any,
          updatedBy: userId,
        },
      });

      await auditRepository.createLog({
        userId,
        userRole,
        action: AuditAction.SETTINGS_UPDATE,
        entityName: 'SystemSetting',
        entityId: 'data_retention',
        metadata: { before, after: config },
      });

      return config;
    } catch {
      return this.inMemoryFallback.updateDataRetention(config, userId, userRole);
    }
  }
}

export const settingsRepository: ISettingsRepository =
  process.env.NODE_ENV === 'test'
    ? new InMemorySettingsRepository()
    : new PrismaSettingsRepository();
