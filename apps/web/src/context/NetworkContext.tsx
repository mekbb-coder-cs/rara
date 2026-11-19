'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { countPendingReports } from '../lib/db';
import { syncOfflineBatch } from '../lib/api';

interface NetworkContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  refreshPendingCount: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await countPendingReports();
      setPendingCount(count);
    } catch {
      // Ignore in non-browser env
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      await syncOfflineBatch();
      await refreshPendingCount();
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshPendingCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when reconnecting!
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check for pending offline items every 15 seconds
    const interval = setInterval(() => {
      refreshPendingCount();
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount, triggerSync]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        refreshPendingCount,
        triggerSync,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return ctx;
}
