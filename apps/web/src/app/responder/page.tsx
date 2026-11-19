'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TriageReportItem, TriageQueueFilters } from '../../lib/types';
import { fetchTriageQueue } from '../../lib/api';
import {
  getSocket,
  disconnectSocket,
  SocketReportCreatedEvent,
  SocketReportStatusEvent,
  SocketPriorityUpdatedEvent,
  SocketReportLockedEvent,
  SocketReportUnlockedEvent,
} from '../../lib/socket';
import { TriageQueue } from '../../components/responder/TriageQueue';
import { ResponderMap } from '../../components/responder/ResponderMap';
import { VerificationModal } from '../../components/responder/VerificationModal';
import {
  ShieldAlert,
  Radio,
  RefreshCw,
  Bell,
  MapPin,
  CheckCircle,
  AlertTriangle,
  User,
} from 'lucide-react';

export default function ResponderPage() {
  const [reports, setReports] = useState<TriageReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<TriageReportItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Authenticated responder context
  const [token, setToken] = useState<string | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string>('responder-demo-id');

  const [filters, setFilters] = useState<TriageQueueFilters>({
    assignment: 'all',
    sortBy: 'priority',
    sortOrder: 'desc',
  });

  // Fetch Triage Queue
  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTriageQueue(filters, token);
      setReports(data.reports);
    } catch (err) {
      console.warn('Failed to load triage queue from API:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    // Check if token exists in localStorage or auth cookie
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('relieflink_token');
      if (storedToken) setToken(storedToken);
      const storedUser = localStorage.getItem('relieflink_user_id');
      if (storedUser) setCurrentUserId(storedUser);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Real-time Socket.IO Connection & Events
  useEffect(() => {
    const socket = getSocket(token);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onReportCreated = (evt: SocketReportCreatedEvent) => {
      setToastMessage(`🚨 New Crisis Reported: ${evt.trackingCode} (${evt.hazardType})`);
      setTimeout(() => setToastMessage(null), 5000);
      loadQueue();
    };

    const onReportStatusChanged = (evt: SocketReportStatusEvent) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === evt.reportId
            ? { ...r, status: evt.newStatus as any, version: evt.version }
            : r
        )
      );
      if (selectedReport?.id === evt.reportId) {
        setSelectedReport((prev) =>
          prev ? { ...prev, status: evt.newStatus as any, version: evt.version } : null
        );
      }
    };

    const onPriorityUpdated = (evt: SocketPriorityUpdatedEvent) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === evt.reportId
            ? {
                ...r,
                priorityScore: evt.compositeScore,
                priorityBreakdown: evt.breakdown,
              }
            : r
        )
      );
      if (selectedReport?.id === evt.reportId) {
        setSelectedReport((prev) =>
          prev
            ? {
                ...prev,
                priorityScore: evt.compositeScore,
                priorityBreakdown: evt.breakdown,
              }
            : null
        );
      }
    };

    const onReportLocked = (evt: SocketReportLockedEvent) => {
      setReports((prev) =>
        prev.map((r) => (r.id === evt.reportId ? { ...r, lockedById: evt.lockedById } : r))
      );
    };

    const onReportUnlocked = (evt: SocketReportUnlockedEvent) => {
      setReports((prev) =>
        prev.map((r) => (r.id === evt.reportId ? { ...r, lockedById: null } : r))
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('report:created', onReportCreated);
    socket.on('report:status_changed', onReportStatusChanged);
    socket.on('report:priority_updated', onPriorityUpdated);
    socket.on('report:locked', onReportLocked);
    socket.on('report:unlocked', onReportUnlocked);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('report:created', onReportCreated);
      socket.off('report:status_changed', onReportStatusChanged);
      socket.off('report:priority_updated', onPriorityUpdated);
      socket.off('report:locked', onReportLocked);
      socket.off('report:unlocked', onReportUnlocked);
      disconnectSocket();
    };
  }, [token, loadQueue, selectedReport?.id]);

  const handleSelectReport = (report: TriageReportItem) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Real-time Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white font-bold text-xs sm:text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Bell className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Subheader: Responder Console Toolbar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-950/80 text-blue-400 border border-blue-800/80 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Responder Triage Console
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-red-400" /> Jurisdiction: Tigray Region (Mekelle, Shire, Adigrat, Axum)
                </span>
                <span>•</span>
                <span className="font-semibold text-slate-300">
                  {reports.length} Active Incidents
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Socket Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                socketConnected
                  ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  socketConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                }`}
              />
              <span>{socketConnected ? 'Real-Time Live' : 'Connecting WS...'}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadQueue}
              disabled={loading}
              title="Refresh queue"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 text-xs font-bold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Triage Queue, Right Live Map */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Triage Queue List (7 Cols) */}
        <div className="lg:col-span-7 h-[70vh] lg:h-[82vh]">
          <TriageQueue
            reports={reports}
            selectedReportId={selectedReport?.id || null}
            onSelectReport={handleSelectReport}
            filters={filters}
            onFiltersChange={setFilters}
            onRefresh={loadQueue}
            token={token}
            currentUserId={currentUserId}
          />
        </div>

        {/* Live Case Map (5 Cols) */}
        <div className="lg:col-span-5 h-[40vh] lg:h-[82vh]">
          <ResponderMap
            reports={reports}
            selectedReportId={selectedReport?.id || null}
            onSelectReport={handleSelectReport}
          />
        </div>
      </div>

      {/* Verification Drawer / Modal */}
      <VerificationModal
        report={selectedReport}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRefresh={() => {
          loadQueue();
          setIsModalOpen(false);
        }}
        token={token}
        currentUserId={currentUserId}
      />
    </div>
  );
}
