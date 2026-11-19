'use client';

import React, { useState, useEffect } from 'react';
import {
  TriageReportItem,
  TriageQueueFilters,
  IncidentType,
  ReportStatus,
  SeverityLevel,
} from '../../lib/types';
import { bulkActionReports } from '../../lib/api';
import { PriorityBadge } from './PriorityBadge';
import {
  Filter,
  Search,
  CheckSquare,
  Square,
  Users,
  Clock,
  MapPin,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  AlertTriangle,
  Flame,
  HelpCircle,
  X,
} from 'lucide-react';

interface TriageQueueProps {
  reports: TriageReportItem[];
  selectedReportId: string | null;
  onSelectReport: (report: TriageReportItem) => void;
  filters: TriageQueueFilters;
  onFiltersChange: (newFilters: TriageQueueFilters) => void;
  onRefresh: () => void;
  token?: string;
  currentUserId?: string;
}

export function TriageQueue({
  reports,
  selectedReportId,
  onSelectReport,
  filters,
  onFiltersChange,
  onRefresh,
  token,
  currentUserId,
}: TriageQueueProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);

  // Keyboard Shortcuts: J, K, Enter/O, V, R, A, ?
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input, textarea, select
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      ) {
        return;
      }

      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, reports.length - 1);
          return next;
        });
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          return next;
        });
      } else if (e.key === 'Enter' || e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        if (reports[selectedIndex]) {
          onSelectReport(reports[selectedIndex]);
        }
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reports, selectedIndex, onSelectReport]);

  const handleSelectAll = () => {
    if (selectedIds.length === reports.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reports.map((r) => r.id));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (
    action: 'VERIFY' | 'REJECT' | 'PRIORITIZE' | 'ASSIGN_TO_ME' | 'UNASSIGN'
  ) => {
    if (selectedIds.length === 0) return;
    setBulkActionSubmitting(true);
    setBulkMessage(null);
    try {
      const result = await bulkActionReports(
        selectedIds,
        action,
        `Bulk ${action.toLowerCase()} performed by responder triage console`,
        token
      );
      setBulkMessage(
        `Bulk ${action} succeeded for ${result.succeeded.length} cases${
          result.failed.length > 0 ? `, ${result.failed.length} failed` : ''
        }`
      );
      setSelectedIds([]);
      onRefresh();
    } catch (err: any) {
      setBulkMessage(err.message || 'Bulk action failed');
    } finally {
      setBulkActionSubmitting(false);
    }
  };

  // Filtered list based on search query
  const filteredReports = reports.filter((r) => {
    if (!filters.searchQuery) return true;
    const query = filters.searchQuery.toLowerCase();
    return (
      r.trackingCode.toLowerCase().includes(query) ||
      r.title.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query) ||
      r.approximateLocation.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Triage Filter Header */}
      <div className="p-3 sm:p-4 bg-slate-800/80 border-b border-slate-700/80 space-y-3">
        {/* Top Controls: Tabs & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Assignment Tabs */}
          <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-700">
            <button
              onClick={() => onFiltersChange({ ...filters, assignment: 'all' })}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                filters.assignment === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Cases ({reports.length})
            </button>
            <button
              onClick={() => onFiltersChange({ ...filters, assignment: 'assigned_to_me' })}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                filters.assignment === 'assigned_to_me'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Assigned to Me
            </button>
            <button
              onClick={() => onFiltersChange({ ...filters, assignment: 'unassigned' })}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                filters.assignment === 'unassigned'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unassigned
            </button>
          </div>

          {/* Search Box & Shortcuts trigger */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={filters.searchQuery || ''}
                onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
                placeholder="Search case, code, place..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-blue-500 w-44 sm:w-56"
              />
            </div>
            <button
              onClick={() => setShowShortcutsHelp(true)}
              title="Keyboard Shortcuts (?)"
              className="p-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">?</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Row: Hazard Type, Status, Sort */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={filters.hazardType || ''}
            onChange={(e) =>
              onFiltersChange({ ...filters, hazardType: e.target.value || undefined })
            }
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1 focus:outline-none"
          >
            <option value="">All Hazards</option>
            <option value="FLOOD">Flood</option>
            <option value="FIRE">Fire</option>
            <option value="MEDICAL">Medical</option>
            <option value="MISSING_PERSON">Missing Person</option>
            <option value="FOOD_WATER">Food / Water</option>
            <option value="SHELTER">Shelter</option>
            <option value="ROAD_BLOCKED">Road Blocked</option>
          </select>

          <select
            value={filters.status || ''}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || undefined })}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="VERIFIED">Verified</option>
            <option value="PRIORITIZED">Prioritized</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => onFiltersChange({ ...filters, sortBy: e.target.value as any })}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1 focus:outline-none ml-auto"
          >
            <option value="priority">Sort by Priority (Desc)</option>
            <option value="createdAt">Sort by Newest</option>
            <option value="waitingTime">Sort by Waiting Time</option>
            <option value="affectedCount">Sort by People Affected</option>
          </select>
        </div>

        {/* Bulk Action Bar (Visible when items selected) */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-blue-950/60 border border-blue-700/60 rounded-xl text-xs animate-fadeIn">
            <span className="font-bold text-blue-300">
              {selectedIds.length} {selectedIds.length === 1 ? 'case' : 'cases'} selected
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => handleBulkAction('VERIFY')}
                disabled={bulkActionSubmitting}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
              >
                Bulk Verify
              </button>
              <button
                onClick={() => handleBulkAction('PRIORITIZE')}
                disabled={bulkActionSubmitting}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded"
              >
                Bulk Prioritize
              </button>
              <button
                onClick={() => handleBulkAction('ASSIGN_TO_ME')}
                disabled={bulkActionSubmitting}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Assign to Me
              </button>
              <button
                onClick={() => handleBulkAction('REJECT')}
                disabled={bulkActionSubmitting}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                Bulk Reject
              </button>
            </div>
          </div>
        )}

        {bulkMessage && (
          <div className="p-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200">
            {bulkMessage}
          </div>
        )}
      </div>

      {/* Triage List Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-semibold text-sm">No incidents match current filter criteria</p>
            <p className="text-xs text-slate-500">Triage queue updates in real-time as reports arrive</p>
          </div>
        ) : (
          filteredReports.map((report, idx) => {
            const isSelected = selectedReportId === report.id;
            const isKeyFocused = selectedIndex === idx;
            const isChecked = selectedIds.includes(report.id);
            const isAssignedToMe = currentUserId && report.assignedResponderId === currentUserId;

            return (
              <div
                key={report.id}
                onClick={() => onSelectReport(report)}
                className={`p-3 sm:p-4 cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-800/60 ${
                  isSelected
                    ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                    : isKeyFocused
                    ? 'bg-slate-800/40 border-l-4 border-l-amber-500'
                    : 'border-l-4 border-l-transparent'
                }`}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => handleToggleSelect(report.id, e)}
                  className="mt-0.5 text-slate-400 hover:text-blue-400"
                >
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                {/* Priority Badge */}
                <div className="shrink-0 mt-0.5">
                  <PriorityBadge
                    score={report.priorityScore}
                    breakdown={report.priorityBreakdown}
                  />
                </div>

                {/* Case Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      {report.trackingCode}
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {report.status.replace('_', ' ')}
                    </span>
                    {report.corroborationCount > 1 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-0.5">
                        <Flame className="w-2.5 h-2.5" /> +{report.corroborationCount - 1} dupes
                      </span>
                    )}
                    {isAssignedToMe && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-blue-950 text-blue-300 border border-blue-800">
                        Assigned to you
                      </span>
                    )}
                    {report.lockedById && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> In Active Triage
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white truncate">{report.title}</h3>

                  <p className="text-xs text-slate-400 line-clamp-1">{report.description}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-400" />
                      <span className="truncate max-w-[180px]">{report.approximateLocation}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-blue-400" />
                      <span>{report.peopleAffectedCount} affected</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        {new Date(report.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-600 mt-2 shrink-0" />
              </div>
            );
          })
        )}
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-400" /> Fast Triage Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsHelp(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded">
                <span className="text-slate-300">Navigate down queue</span>
                <kbd className="px-2 py-0.5 bg-slate-950 font-mono text-amber-400 border border-slate-700 rounded">
                  J
                </kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded">
                <span className="text-slate-300">Navigate up queue</span>
                <kbd className="px-2 py-0.5 bg-slate-950 font-mono text-amber-400 border border-slate-700 rounded">
                  K
                </kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded">
                <span className="text-slate-300">Open selected case drawer</span>
                <kbd className="px-2 py-0.5 bg-slate-950 font-mono text-amber-400 border border-slate-700 rounded">
                  Enter / O
                </kbd>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded">
                <span className="text-slate-300">Toggle shortcuts cheat sheet</span>
                <kbd className="px-2 py-0.5 bg-slate-950 font-mono text-amber-400 border border-slate-700 rounded">
                  ?
                </kbd>
              </div>
            </div>

            <button
              onClick={() => setShowShortcutsHelp(false)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
