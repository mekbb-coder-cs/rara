export interface OperationsMetrics {
  reportsOverTime: Array<{
    date: string;
    total: number;
    verified: number;
    resolved: number;
  }>;
  averageTimeToVerifyMinutes: number;
  averageTimeToMatchMinutes: number;
  averageTimeToResolveMinutes: number;
  unmetNeedsByRegionAndType: Array<{
    regionId: string;
    regionName: string;
    aidType: string;
    count: number;
    quantity: number;
  }>;
  responderWorkload: Array<{
    responderId: string;
    responderName: string;
    activeCount: number;
    resolvedCount: number;
    avgResolutionHours: number;
  }>;
  providerFulfilment: {
    totalMatches: number;
    fulfilledCount: number;
    declinedCount: number;
    partialCount: number;
    fulfilmentRatePercentage: number;
  };
  heatMapPoints: Array<{
    latitude: number;
    longitude: number;
    intensity: number;
    count: number;
  }>;
}

export interface PriorityWeightsConfig {
  weightSeverity: number;
  weightPeople: number;
  weightVulnerability: number;
  weightWaitingTime: number;
}

export interface DuplicateClusteringConfig {
  radiusMeters: number;
  timeWindowMinutes: number;
  textSimilarityThreshold?: number;
}

export interface EscalationThresholdsConfig {
  defaultUnverifiedMinutes: number;
  defaultUnmatchedMinutes: number;
}

export interface DataRetentionConfig {
  retentionDays: number;
  autoAnonymizeEnabled: boolean;
}

export interface SystemConfig {
  priorityWeights: PriorityWeightsConfig;
  duplicateClustering: DuplicateClusteringConfig;
  escalationThresholds: EscalationThresholdsConfig;
  featureFlags: Record<string, boolean>;
  dataRetention: DataRetentionConfig;
}

export interface AuditLogItem {
  id: string;
  userId: string | null;
  userName?: string | null;
  userRole: string | null;
  action: string;
  entityName: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  timestamp: string;
}

export interface AuditLogFilter {
  userId?: string;
  action?: string;
  entityName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  format?: 'json' | 'csv';
}

export interface RetentionRunResult {
  scannedCount: number;
  anonymizedCount: number;
  deletedCount: number;
  timestamp: string;
}

export interface UserDataExport {
  user: any;
  reportsSubmitted: any[];
  auditEvents: any[];
  exportedAt: string;
}

export interface DataDeletionResult {
  success: boolean;
  userId: string;
  anonymizedReportsCount: number;
  message: string;
}

export interface AfterActionReportSummary {
  title: string;
  regionId: string;
  regionName: string;
  startDate: string;
  endDate: string;
  totalIncidents: number;
  verifiedIncidents: number;
  resolvedIncidents: number;
  avgTimeToVerifyMinutes: number;
  avgTimeToResolveMinutes: number;
  totalAidNeeds: number;
  fulfilledAidNeeds: number;
  aidFulfilmentPercentage: number;
  timelineEvents: Array<{
    time: string;
    event: string;
    details: string;
  }>;
  resourceExpenditure: Array<{
    aidType: string;
    quantity: number;
    unit: string;
  }>;
}

export interface PublicTransparencyMetrics {
  totalReports: number;
  totalVerified: number;
  totalResolved: number;
  totalAidDeliveredJerrycans: number;
  totalAidDeliveredFoodRations: number;
  totalMedicalKitsDelivered: number;
  avgTimeToTriageMinutes: number;
  avgTimeToResolveMinutes: number;
  activeZonesCount: number;
  breakdownByHazard: Record<string, number>;
  lastUpdated: string;
}
