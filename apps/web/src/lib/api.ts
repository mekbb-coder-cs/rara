import {
  ReportFormData,
  PublicReportFeedItem,
  ReportTimelineResponse,
  TriageReportItem,
  SensitiveDetails,
  VerificationMethod,
  TriageQueueFilters,
  OperationsMetrics,
  SystemConfig,
  PriorityWeightsConfig,
  DuplicateClusteringConfig,
  EscalationThresholdsConfig,
  DataRetentionConfig,
  AdminUserItem,
  AuditLogItem,
  RetentionRunResult,
  UserDataExport,
  DataDeletionResult,
  AfterActionReportSummary,
  PublicTransparencyMetrics,
} from './types';
import { saveOfflineReport, getPendingOfflineReports, markReportSynced } from './db';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface SubmitReportResult {
  success: boolean;
  trackingCode: string;
  savedOffline: boolean;
  message?: string;
}

export async function submitReport(data: ReportFormData): Promise<SubmitReportResult> {
  // If explicitly offline, save to IndexedDB directly
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineItem = await saveOfflineReport(data);
    return {
      success: true,
      trackingCode: offlineItem.localId,
      savedOffline: true,
      message: 'Saved in offline queue. Will sync when connectivity returns.',
    };
  }

  const idempotencyKey = `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.message || `Server responded with ${res.status}`);
    }

    const json = await res.json();
    return {
      success: true,
      trackingCode: json.data.trackingCode,
      savedOffline: false,
    };
  } catch (err: unknown) {
    // If it was a network error (server unreachable, connection dropped during disaster), fallback to IndexedDB!
    const offlineItem = await saveOfflineReport(data);
    return {
      success: true,
      trackingCode: offlineItem.localId,
      savedOffline: true,
      message: (err as Error).message || 'Network unreachable. Saved offline.',
    };
  }
}

export async function syncOfflineBatch(): Promise<{ syncedCount: number; errors: string[] }> {
  const pending = await getPendingOfflineReports();
  if (pending.length === 0) {
    return { syncedCount: 0, errors: [] };
  }

  const batchPayload = pending.map((item) => ({
    clientReportId: item.localId,
    offlineCreatedAt: item.createdAt,
    ...item.payload,
  }));

  try {
    const res = await fetch(`${API_BASE_URL}/reports/offline-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reports: batchPayload }),
    });

    if (!res.ok) {
      throw new Error(`Offline sync failed with status ${res.status}`);
    }

    const data = await res.json();
    const createdReports = data.data?.created || [];

    // Mark matched local items as synced
    for (const item of pending) {
      const match = createdReports.find(
        (cr: { clientReportId?: string }) => cr.clientReportId === item.localId
      );
      if (match) {
        await markReportSynced(item.localId);
      }
    }

    return {
      syncedCount: createdReports.length,
      errors: data.data?.errors || [],
    };
  } catch (err: unknown) {
    return {
      syncedCount: 0,
      errors: [(err as Error).message || 'Failed to sync offline batch'],
    };
  }
}

export async function fetchPublicFeed(type?: string): Promise<PublicReportFeedItem[]> {
  try {
    const url = new URL(`${API_BASE_URL}/reports/public-feed`);
    if (type && type !== 'ALL') {
      url.searchParams.set('type', type);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to fetch public feed: ${res.status}`);
    }

    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn('Public feed fetch error:', err);
    return [];
  }
}

export async function fetchReportTimeline(trackingCode: string): Promise<ReportTimelineResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/track/${encodeURIComponent(trackingCode)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch report tracking info: ${res.status}`);
    }

    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export async function fetchTriageQueue(
  filters: Partial<TriageQueueFilters> = {},
  token?: string
): Promise<{ reports: TriageReportItem[]; total: number }> {
  const url = new URL(`${API_BASE_URL}/reports/triage`);
  if (filters.status) url.searchParams.set('status', filters.status);
  if (filters.hazardType) url.searchParams.set('hazardType', filters.hazardType);
  if (filters.urgency) url.searchParams.set('urgency', filters.urgency);
  if (filters.assignment) url.searchParams.set('assignment', filters.assignment);
  if (filters.maxAgeHours) url.searchParams.set('maxAgeHours', String(filters.maxAgeHours));
  if (filters.sortBy) url.searchParams.set('sortBy', filters.sortBy);
  if (filters.sortOrder) url.searchParams.set('sortOrder', filters.sortOrder);

  const res = await fetch(url.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch triage queue', res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return {
    reports: json.data || [],
    total: json.total || 0,
  };
}

export async function verifyReport(
  reportId: string,
  input: {
    status: 'VERIFIED' | 'REJECTED';
    method: VerificationMethod;
    confidence: number;
    reason: string;
    expectedVersion?: number;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Verification failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function updateReportStatus(
  reportId: string,
  input: {
    newStatus: string;
    reason?: string;
    expectedVersion?: number;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Status transition failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function lockReport(
  reportId: string,
  expectedVersion?: number,
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ expectedVersion }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Lock acquisition failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function unlockReport(reportId: string, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/unlock`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Unlock failed', res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function assignResponder(
  reportId: string,
  responderId: string | null,
  expectedVersion?: number,
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ responderId, expectedVersion }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Assignment failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function overridePriority(
  reportId: string,
  input: {
    overrideScore: number;
    overrideReason: string;
    expectedVersion?: number;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/priority-override`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Priority override failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function revealSensitiveDetails(
  reportId: string,
  token?: string
): Promise<SensitiveDetails> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/reveal-sensitive`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Access to sensitive data denied';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function requestMoreInfo(
  reportId: string,
  input: { message: string; expectedVersion?: number },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}/request-info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Request more info failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  return res.json();
}

export async function bulkActionReports(
  reportIds: string[],
  action: 'VERIFY' | 'REJECT' | 'PRIORITIZE' | 'ASSIGN_TO_ME' | 'UNASSIGN',
  reason?: string,
  token?: string
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const res = await fetch(`${API_BASE_URL}/reports/bulk-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ reportIds, action, reason }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Bulk action failed', res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

// ==========================================
// PHASE 6: AID SUPPLY & MATCHING API CALLS
// ==========================================

export async function createAidOffer(
  offerData: {
    aidType: string;
    title: string;
    description?: string;
    capacityTotal: number;
    unit: string;
    latitude: number;
    longitude: number;
    serviceRadiusKm?: number;
    availableUntil?: string;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(offerData),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Publishing aid offer failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function listAidOffers(
  filters?: { aidType?: string; status?: string; regionId?: string },
  token?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.aidType) params.append('aidType', filters.aidType);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.regionId) params.append('regionId', filters.regionId);

  const res = await fetch(`${API_BASE_URL}/aid/offers?${params.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function listAidNeeds(
  filters?: { reportId?: string; aidType?: string; status?: string; isEscalated?: boolean },
  token?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.reportId) params.append('reportId', filters.reportId);
  if (filters?.aidType) params.append('aidType', filters.aidType);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.isEscalated !== undefined) params.append('isEscalated', String(filters.isEscalated));

  const res = await fetch(`${API_BASE_URL}/aid/needs?${params.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function createAidNeed(
  needData: {
    reportId: string;
    aidType: string;
    quantityRequired: number;
    unit: string;
    urgency: string;
    notes?: string;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/needs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(needData),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Structuring aid need failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function getCandidateMatches(
  needId: string,
  token?: string
): Promise<{
  need: any;
  candidates: any[];
  noMatchFound: boolean;
  candidateCount: number;
}> {
  const res = await fetch(`${API_BASE_URL}/aid/needs/${needId}/candidates`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(
      errorJson.message || 'Fetching match candidates failed',
      res.status,
      errorJson?.error?.code
    );
  }

  const json = await res.json();
  return json.data;
}

export async function confirmMatch(
  params: {
    needId: string;
    offerId: string;
    requestedQuantity: number;
    timeoutMinutes?: number;
    notes?: string;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/matches/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message =
      errorJson.message ||
      errorJson?.error?.message ||
      'Match confirmation failed. Stock may have been allocated to another incident.';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function providerRespondToMatch(
  matchId: string,
  data: {
    action: 'ACCEPT' | 'DECLINE' | 'PARTIAL';
    declineReason?: string;
    partiallyFulfilledQuantity?: number;
    notes?: string;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/matches/${matchId}/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.message || errorJson?.error?.message || 'Provider response failed';
    throw new ApiError(message, res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function listProviderMatches(token?: string): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/aid/matches/provider-queue`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function escalateNeed(
  needId: string,
  reason: string,
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/needs/${needId}/escalate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Escalation failed', res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function getCoordinatorOverview(token?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aid/coordinator/unmatched`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return { unmatchedNeeds: [], totalEscalated: 0, totalOpen: 0 };
  }

  const json = await res.json();
  return json.data;
}

// ==========================================
// PHASE 7: COORDINATION & COMMUNICATION
// ==========================================

export async function createTask(
  params: {
    reportId: string;
    matchId?: string | null;
    type: string;
    title: string;
    description?: string | null;
    deadline?: string | null;
    assigneeId?: string | null;
    assigneeName?: string | null;
    checklist?: Array<{ id: string; text: string; completed: boolean }>;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Creating task failed', res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function listTasks(
  filters?: { reportId?: string; assigneeId?: string; status?: string; type?: string },
  token?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.reportId) params.append('reportId', filters.reportId);
  if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);

  const res = await fetch(`${API_BASE_URL}/coordination/tasks?${params.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function getTask(id: string, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/tasks/${id}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new ApiError('Task not found', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updateTaskStatus(
  id: string,
  data: {
    status: string;
    checklist?: Array<{ id: string; text: string; completed: boolean }>;
    note?: string;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/tasks/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Updating task status failed', res.status, errorJson?.error?.code);
  }

  const json = await res.json();
  return json.data;
}

export async function updateTaskLocation(
  id: string,
  data: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    isTrackingActive?: boolean;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/tasks/${id}/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Updating task location failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function getLiveVolunteerTracking(token?: string): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/coordination/tracking/live`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function closeCase(
  reportId: string,
  data: { closingNote: string; confirmedWithReporter: boolean },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/cases/${reportId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Closing case failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function reopenCase(
  reportId: string,
  data: { reopenReason: string },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/cases/${reportId}/reopen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Reopening case failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function getCaseChat(reportId: string, token?: string): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/coordination/cases/${reportId}/chat`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  return json.data || [];
}

export async function sendCaseChatMessage(
  reportId: string,
  message: string,
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/cases/${reportId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Sending message failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function listBroadcastAlerts(regionId?: string): Promise<any[]> {
  const url = regionId
    ? `${API_BASE_URL}/coordination/broadcasts?regionId=${regionId}`
    : `${API_BASE_URL}/coordination/broadcasts`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function createBroadcastAlert(
  data: {
    title: string;
    message: string;
    severity?: string;
    regionId?: string | null;
    areaName?: string | null;
    expiresAt?: string | null;
  },
  token?: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/broadcasts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Publishing broadcast failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function listEscalations(token?: string): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/coordination/escalations`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function acknowledgeEscalation(id: string, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/coordination/escalations/${id}/acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Acknowledging escalation failed', res.status);
  }

  const json = await res.json();
  return json.data;
}

// ==========================================
// PHASE 8: ANALYTICS, ADMIN & COMPLIANCE
// ==========================================

export async function getOperationsMetrics(token?: string): Promise<OperationsMetrics> {
  const res = await fetch(`${API_BASE_URL}/analytics/operations`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch operations metrics', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function getAfterActionReport(
  params?: { regionId?: string; startDate?: string; endDate?: string },
  token?: string
): Promise<AfterActionReportSummary> {
  const url = new URL(`${API_BASE_URL}/analytics/after-action-report`);
  if (params?.regionId) url.searchParams.set('regionId', params.regionId);
  if (params?.startDate) url.searchParams.set('startDate', params.startDate);
  if (params?.endDate) url.searchParams.set('endDate', params.endDate);

  const res = await fetch(url.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch after-action report', res.status);
  }

  const json = await res.json();
  return json.data;
}

export function getAfterActionReportCsvUrl(params?: {
  regionId?: string;
  startDate?: string;
  endDate?: string;
}): string {
  const url = new URL(`${API_BASE_URL}/analytics/after-action-report`);
  url.searchParams.set('format', 'csv');
  if (params?.regionId) url.searchParams.set('regionId', params.regionId);
  if (params?.startDate) url.searchParams.set('startDate', params.startDate);
  if (params?.endDate) url.searchParams.set('endDate', params.endDate);
  return url.toString();
}

export async function getPublicTransparencyMetrics(): Promise<PublicTransparencyMetrics> {
  const res = await fetch(`${API_BASE_URL}/analytics/transparency`);

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch transparency metrics', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function getSystemConfig(token?: string): Promise<SystemConfig> {
  const res = await fetch(`${API_BASE_URL}/admin/config`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch system config', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updatePriorityWeights(
  weights: PriorityWeightsConfig,
  token?: string
): Promise<PriorityWeightsConfig> {
  const res = await fetch(`${API_BASE_URL}/admin/config/priority-weights`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(weights),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update priority weights', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updateDuplicateClustering(
  config: DuplicateClusteringConfig,
  token?: string
): Promise<DuplicateClusteringConfig> {
  const res = await fetch(`${API_BASE_URL}/admin/config/duplicate-clustering`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update duplicate clustering config', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updateEscalationThresholds(
  thresholds: EscalationThresholdsConfig,
  token?: string
): Promise<EscalationThresholdsConfig> {
  const res = await fetch(`${API_BASE_URL}/admin/config/escalation-thresholds`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(thresholds),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update escalation thresholds', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updateFeatureFlags(
  flags: Record<string, boolean>,
  token?: string
): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE_URL}/admin/config/feature-flags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(flags),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update feature flags', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function updateDataRetention(
  config: DataRetentionConfig,
  token?: string
): Promise<DataRetentionConfig> {
  const res = await fetch(`${API_BASE_URL}/admin/config/data-retention`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update data retention config', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function listAdminUsers(token?: string): Promise<AdminUserItem[]> {
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to list users', res.status);
  }

  const json = await res.json();
  return json.data || [];
}

export async function updateAdminUser(
  userId: string,
  data: { role?: string; isVerifiedResponder?: boolean },
  token?: string
): Promise<AdminUserItem> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to update user', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function getAdminAuditLogs(
  params?: { actorId?: string; action?: string; entityName?: string; limit?: number; offset?: number },
  token?: string
): Promise<AuditLogItem[]> {
  const url = new URL(`${API_BASE_URL}/admin/audit-logs`);
  if (params?.actorId) url.searchParams.set('actorId', params.actorId);
  if (params?.action) url.searchParams.set('action', params.action);
  if (params?.entityName) url.searchParams.set('entityName', params.entityName);
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));

  const res = await fetch(url.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to fetch audit logs', res.status);
  }

  const json = await res.json();
  return json.data || [];
}

export function getAuditLogsExportCsvUrl(): string {
  return `${API_BASE_URL}/admin/audit-logs/export`;
}

export async function triggerRetentionJob(
  retentionDays?: number,
  token?: string
): Promise<RetentionRunResult> {
  const res = await fetch(`${API_BASE_URL}/compliance/retention/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(retentionDays ? { retentionDays } : {}),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to trigger data retention job', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function exportUserData(userId: string, token?: string): Promise<UserDataExport> {
  const res = await fetch(`${API_BASE_URL}/compliance/users/${userId}/export`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to export user data', res.status);
  }

  const json = await res.json();
  return json.data;
}

export async function deleteUserData(userId: string, token?: string): Promise<DataDeletionResult> {
  const res = await fetch(`${API_BASE_URL}/compliance/users/${userId}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new ApiError(errorJson.message || 'Failed to delete user data', res.status);
  }

  const json = await res.json();
  return json.data;
}

