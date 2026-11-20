export type IncidentType =
  | 'FLOOD'
  | 'FIRE'
  | 'MEDICAL'
  | 'MISSING_PERSON'
  | 'FOOD_WATER'
  | 'SHELTER'
  | 'ROAD_BLOCKED'
  | 'OTHER';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'LIFE_THREATENING';

export type ReportStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'PRIORITIZED'
  | 'MATCHED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED';

export interface ReportFormData {
  type: IncidentType;
  description: string;
  severity: SeverityLevel;
  affectedCount: number;
  vulnerableGroups: string[];
  latitude: number;
  longitude: number;
  address: string;
  contactPhone?: string;
  isAnonymous: boolean;
  honeypot?: string;
  mediaUrls?: string[];
}

export interface OfflineReportItem {
  localId: string;
  payload: ReportFormData;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  error?: string;
}

export interface PublicReportFeedItem {
  id: string;
  trackingCode: string;
  type: IncidentType;
  status: ReportStatus;
  severity: SeverityLevel;
  affectedCount: number;
  latitude: number;
  longitude: number;
  address: string;
  createdAt: string;
}

export interface ReportTimelineEvent {
  id: string;
  reportId: string;
  authorType: 'REPORTER' | 'RESPONDER' | 'SYSTEM';
  authorName?: string;
  message: string;
  mediaUrls: string[];
  createdAt: string;
}

export interface ReportTimelineResponse {
  report: {
    id: string;
    trackingCode: string;
    type: IncidentType;
    status: ReportStatus;
    severity: SeverityLevel;
    affectedCount: number;
    address: string;
    latitude: number;
    longitude: number;
    createdAt: string;
    updatedAt: string;
  };
  updates: ReportTimelineEvent[];
}

export type VerificationMethod =
  | 'PHONE_CALL'
  | 'ON_SITE_VISIT'
  | 'OFFICIAL_AGENCY'
  | 'PHOTO_METADATA'
  | 'CROSS_REPORT_CORROBORATION';

export interface PriorityBreakdown {
  severityScore: number;
  peopleFactor: number;
  vulnerabilityScore: number;
  timeFactor: number;
  baseSum: number;
  hazardMultiplier: number;
  confidenceMultiplier: number;
  compositeScore: number;
  formula?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface TriageReportItem {
  id: string;
  trackingCode: string;
  title: string;
  description: string;
  hazardType: IncidentType;
  status: ReportStatus;
  severity: SeverityLevel;
  approximateLocation: string;
  latitude: number;
  longitude: number;
  peopleAffectedCount: number;
  vulnerableGroups: string[];
  corroborationCount: number;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdown | null;
  version: number;
  assignedResponderId: string | null;
  lockedById: string | null;
  lockedAt: string | null;
  verificationStatus: string;
  createdAt: string;
}

export interface SensitiveDetails {
  exactAddress: string;
  reporterPhone: string | null;
  reporterName: string | null;
}

export interface TriageQueueFilters {
  hazardType?: string;
  status?: string;
  urgency?: string;
  assignment: 'all' | 'assigned_to_me' | 'unassigned';
  maxAgeHours?: number;
  sortBy: 'priority' | 'createdAt' | 'waitingTime' | 'affectedCount';
  sortOrder: 'asc' | 'desc';
  searchQuery?: string;
}

// ==========================================
// PHASE 6: AID SUPPLY & MATCHING TYPES
// ==========================================

export type AidType =
  | 'FOOD_WATER'
  | 'MEDICAL_SUPPLIES'
  | 'SHELTER_BEDDING'
  | 'SEARCH_AND_RESCUE'
  | 'EVACUATION_TRANSPORT'
  | 'EQUIPMENT_TOOLS'
  | 'HYGIENE_KIT'
  | 'PERSONNEL_VOLUNTEER';

export type AidStatus = 'AVAILABLE' | 'COMMITTED' | 'DEPLETED' | 'EXPIRED' | 'SUSPENDED';

export type NeedUrgency = 'IMMEDIATE' | 'URGENT' | 'STANDARD' | 'FLEXIBLE';

export type MatchStatus =
  | 'PROPOSED'
  | 'ACCEPTED_BY_RESPONDER'
  | 'PENDING_PROVIDER'
  | 'ACCEPTED_BY_PROVIDER'
  | 'DECLINED_BY_PROVIDER'
  | 'TIMED_OUT'
  | 'DISPATCHED'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'REJECTED';

export type NeedStatus =
  | 'OPEN'
  | 'MATCH_PROPOSED'
  | 'MATCHED'
  | 'FULFILLED'
  | 'ESCALATED_TO_COORDINATOR';

export interface ScoreBreakdownItem {
  typeFitScore: number;
  distanceScore: number;
  capacityScore: number;
  reliabilityScore: number;
  urgencyMultiplier: number;
  estimatedDistanceKm: number;
  estimatedTravelMinutes: number;
  compositeScore: number;
  reasons: string[];
}

export interface MatchCandidateItem {
  offerId: string;
  organizationId: string;
  organizationName: string;
  providerReliabilityScore: number;
  aidType: AidType;
  title: string;
  description?: string;
  capacityAvailable: number;
  capacityTotal: number;
  unit: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  estimatedTravelMinutes: number;
  compatibilityScore: number;
  scoreBreakdown: ScoreBreakdownItem;
  availableUntil?: string;
}

export interface AidOfferItem {
  id: string;
  organizationId: string;
  organizationName?: string;
  aidType: AidType;
  title: string;
  description?: string | null;
  capacityTotal: number;
  capacityRemaining: number;
  capacityReserved: number;
  capacityFulfilled: number;
  unit: string;
  status: AidStatus;
  latitude: number;
  longitude: number;
  serviceRadiusKm: number;
  availableFrom: string;
  availableUntil?: string | null;
  version: number;
  createdAt: string;
}

export interface AidNeedItem {
  id: string;
  reportId: string;
  reportTrackingCode?: string;
  reportTitle?: string;
  aidType: AidType;
  quantityRequired: number;
  quantityFulfilled: number;
  unit: string;
  urgency: NeedUrgency;
  status: NeedStatus;
  notes?: string | null;
  latitude: number;
  longitude: number;
  isEscalated: boolean;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  createdAt: string;
}

export interface MatchRecordItem {
  id: string;
  needId: string;
  offerId: string;
  organizationId: string;
  matchedQuantity: number;
  compatibilityScore: number;
  distanceMeters: number;
  estimatedTravelMins?: number | null;
  status: MatchStatus;
  scoreBreakdown: ScoreBreakdownItem;
  declineReason?: string | null;
  partiallyFulfilledQuantity?: number | null;
  timeoutAt?: string | null;
  proposedAt: string;
  confirmedAt?: string | null;
  fulfilledAt?: string | null;
  need?: AidNeedItem;
  offer?: AidOfferItem;
}

// ==========================================
// PHASE 7: COORDINATION & COMMUNICATION
// ==========================================

export type TaskType =
  | 'DELIVER_SUPPLIES'
  | 'EVACUATE'
  | 'MEDICAL_VISIT'
  | 'SEARCH_RESCUE'
  | 'DAMAGE_ASSESSMENT'
  | 'OTHER';

export type TaskStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'DONE' | 'FAILED';

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskRecordItem {
  id: string;
  reportId: string;
  reportTrackingCode?: string;
  matchId?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  type: TaskType;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: TaskStatus;
  checklist: TaskChecklistItem[];
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastLocationAt?: string | null;
  isTrackingActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LiveVolunteerLocation {
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  taskTitle: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface TeamChatMessageItem {
  id: string;
  reportId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderOrg?: string | null;
  message: string;
  createdAt: string;
}

export interface BroadcastAlertItem {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  regionId?: string | null;
  areaName?: string | null;
  active: boolean;
  expiresAt?: string | null;
  createdByName?: string;
  createdAt: string;
}

export interface EscalationAlertItem {
  id: string;
  reportId: string;
  reportTrackingCode: string;
  reportTitle: string;
  regionId: string;
  reason: 'UNVERIFIED_STALLED' | 'UNMATCHED_STALLED' | 'MANUAL_ESCALATION';
  waitingMinutes: number;
  triggeredAt: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
}

// ==========================================
// PHASE 8: ANALYTICS, ADMIN & COMPLIANCE
// ==========================================

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

export interface AdminUserItem {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  fullName: string | null;
  role: string;
  isVerifiedResponder: boolean;
  isEmailVerified: boolean;
  createdAt: string;
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

