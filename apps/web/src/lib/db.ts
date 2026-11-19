import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { OfflineReportItem, ReportFormData } from './types';

interface ReliefLinkDB extends DBSchema {
  reports: {
    key: string;
    value: OfflineReportItem;
    indexes: { 'by-status': string };
  };
}

const DB_NAME = 'relieflink-offline-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ReliefLinkDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ReliefLinkDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only accessible in browser'));
  }
  if (!dbPromise) {
    dbPromise = openDB<ReliefLinkDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('reports')) {
          const store = db.createObjectStore('reports', { keyPath: 'localId' });
          store.createIndex('by-status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineReport(payload: ReportFormData): Promise<OfflineReportItem> {
  const db = await getDb();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const localId = `RL-OFFLINE-${Date.now()}-${rand}`;
  
  const item: OfflineReportItem = {
    localId,
    payload,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
  };

  await db.put('reports', item);
  return item;
}

export async function getPendingOfflineReports(): Promise<OfflineReportItem[]> {
  try {
    const db = await getDb();
    const all = await db.getAll('reports');
    return all.filter((r) => r.status === 'PENDING');
  } catch {
    return [];
  }
}

export async function markReportSynced(localId: string): Promise<void> {
  const db = await getDb();
  const item = await db.get('reports', localId);
  if (item) {
    item.status = 'SYNCED';
    await db.put('reports', item);
  }
}

export async function countPendingReports(): Promise<number> {
  try {
    const pending = await getPendingOfflineReports();
    return pending.length;
  } catch {
    return 0;
  }
}

export async function clearSyncedReports(): Promise<void> {
  const db = await getDb();
  const all = await db.getAll('reports');
  const tx = db.transaction('reports', 'readwrite');
  for (const item of all) {
    if (item.status === 'SYNCED') {
      await tx.store.delete(item.localId);
    }
  }
  await tx.done;
}
