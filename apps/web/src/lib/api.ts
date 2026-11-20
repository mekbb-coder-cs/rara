import {
  ReportFormData,
  PublicReportFeedItem,
  ReportTimelineResponse,
  TriageReportItem,
  SensitiveDetails,
  VerificationMethod,
  TriageQueueFilters,
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
