'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import * as api from '../../lib/api';
import { BroadcastAlertItem } from '../../lib/types';

export function BroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState<BroadcastAlertItem[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    loadBroadcasts();
  }, []);

  async function loadBroadcasts() {
    try {
      const data = await api.listBroadcastAlerts();
      setBroadcasts(data || []);
    } catch {
      // Hermetic fallback
    }
  }

  const activeBroadcasts = broadcasts.filter((b) => !dismissedIds.includes(b.id));
  if (activeBroadcasts.length === 0) return null;

  const current = activeBroadcasts[0];

  return (
    <div
      role="region"
      aria-label="Emergency Broadcast Notice"
      className={`px-4 py-3 text-xs sm:text-sm font-bold shadow-md transition-all ${
        current.severity === 'CRITICAL'
          ? 'bg-red-600 text-white animate-pulse'
          : current.severity === 'WARNING'
            ? 'bg-amber-500 text-slate-950'
            : 'bg-blue-600 text-white'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {current.severity === 'CRITICAL' ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          ) : current.severity === 'WARNING' ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Info className="w-5 h-5 flex-shrink-0" />
          )}
          <span>
            <strong>AREA ADVISORY:</strong> {current.title} — {current.message}
            {current.areaName && <span className="opacity-80"> ({current.areaName})</span>}
          </span>
        </div>
        <button
          onClick={() => setDismissedIds((prev) => [...prev, current.id])}
          aria-label="Dismiss Advisory"
          className="p-1 rounded-full hover:bg-black/20 transition flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
