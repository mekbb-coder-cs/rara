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

