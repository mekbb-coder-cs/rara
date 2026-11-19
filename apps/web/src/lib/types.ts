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
