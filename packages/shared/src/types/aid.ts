export enum AidType {
  FOOD_WATER = 'FOOD_WATER',
  MEDICAL_SUPPLIES = 'MEDICAL_SUPPLIES',
  SHELTER_BEDDING = 'SHELTER_BEDDING',
  SEARCH_AND_RESCUE = 'SEARCH_AND_RESCUE',
  EVACUATION_TRANSPORT = 'EVACUATION_TRANSPORT',
  EQUIPMENT_TOOLS = 'EQUIPMENT_TOOLS',
  HYGIENE_KIT = 'HYGIENE_KIT',
  PERSONNEL_VOLUNTEER = 'PERSONNEL_VOLUNTEER',
}

export enum AidStatus {
  AVAILABLE = 'AVAILABLE',
  COMMITTED = 'COMMITTED',
  DEPLETED = 'DEPLETED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export enum NeedUrgency {
  IMMEDIATE = 'IMMEDIATE',
  URGENT = 'URGENT',
  STANDARD = 'STANDARD',
  FLEXIBLE = 'FLEXIBLE',
}

export enum MatchStatus {
  PROPOSED = 'PROPOSED',
  ACCEPTED_BY_RESPONDER = 'ACCEPTED_BY_RESPONDER',
  PENDING_PROVIDER = 'PENDING_PROVIDER',
  ACCEPTED_BY_PROVIDER = 'ACCEPTED_BY_PROVIDER',
  DECLINED_BY_PROVIDER = 'DECLINED_BY_PROVIDER',
  TIMED_OUT = 'TIMED_OUT',
  DISPATCHED = 'DISPATCHED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum NeedStatus {
  OPEN = 'OPEN',
  MATCH_PROPOSED = 'MATCH_PROPOSED',
  MATCHED = 'MATCHED',
  FULFILLED = 'FULFILLED',
  ESCALATED_TO_COORDINATOR = 'ESCALATED_TO_COORDINATOR',
}

export interface MatchScoreBreakdown {
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

export interface MatchCandidate {
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
  scoreBreakdown: MatchScoreBreakdown;
  availableUntil?: string;
}

export interface AidOfferRecord {
  id: string;
  organizationId: string;
  organizationName?: string;
  userId?: string;
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
  regionId?: string | null;
  availableFrom: string;
  availableUntil?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AidNeedRecord {
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
  updatedAt: string;
}

export interface MatchRecord {
  id: string;
  needId: string;
  offerId: string;
  organizationId: string;
  matchedQuantity: number;
  compatibilityScore: number;
  distanceMeters: number;
  estimatedTravelMins?: number | null;
  status: MatchStatus;
  scoreBreakdown: MatchScoreBreakdown;
  declineReason?: string | null;
  partiallyFulfilledQuantity?: number | null;
  timeoutAt?: string | null;
  proposedAt: string;
  confirmedAt?: string | null;
  fulfilledAt?: string | null;
  cancelledAt?: string | null;
  isRerouted: boolean;
  reroutedMatchId?: string | null;
  need?: AidNeedRecord;
  offer?: AidOfferRecord;
}
