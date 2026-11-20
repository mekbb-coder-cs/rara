'use client';

import React, { useState, useEffect } from 'react';
import {
  TriageReportItem,
  SensitiveDetails,
  VerificationMethod,
  ReportStatus,
} from '../../lib/types';
import {
  verifyReport,
  updateReportStatus,
  overridePriority,
  revealSensitiveDetails,
  requestMoreInfo,
  assignResponder,
  ApiError,
} from '../../lib/api';
import { PriorityBadge } from './PriorityBadge';
import { MatchingPanel } from './MatchingPanel';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Phone,
  MapPin,
  Users,
  Clock,
  AlertTriangle,
  Lock,
  Unlock,
  Eye,
  MessageSquare,
  Flame,
  CheckCircle,
  HelpCircle,
  Sliders,
  Truck,
} from 'lucide-react';

interface VerificationModalProps {
  report: TriageReportItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  token?: string;
  currentUserId?: string;
}

export function VerificationModal({
  report,
  isOpen,
  onClose,
  onRefresh,
  token,
  currentUserId,
}: VerificationModalProps) {
  const [activeTab, setActiveTab] = useState<'verify' | 'status' | 'override' | 'info' | 'matching'>('verify');
  const [sensitive, setSensitive] = useState<SensitiveDetails | null>(null);
  const [revealingPii, setRevealingPii] = useState(false);
  const [piiError, setPiiError] = useState<string | null>(null);

  // Form states
  const [verifyStatus, setVerifyStatus] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [verifyMethod, setVerifyMethod] = useState<VerificationMethod>('PHONE_CALL');
  const [verifyConfidence, setVerifyConfidence] = useState<number>(0.9);
  const [verifyReason, setVerifyReason] = useState<string>('');

  const [nextStatus, setNextStatus] = useState<ReportStatus>('UNDER_REVIEW');
  const [statusReason, setStatusReason] = useState<string>('');

  const [overrideScore, setOverrideScore] = useState<number>(75);
  const [overrideReason, setOverrideReason] = useState<string>('');

  const [infoMessage, setInfoMessage] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (report) {
      setSensitive(null);
      setPiiError(null);
      setConflictError(null);
      setActionSuccess(null);
      setVerifyReason('');
      setStatusReason('');
      setOverrideScore(Math.round(report.priorityScore || 50));
      setOverrideReason('');
      setInfoMessage('');
    }
  }, [report?.id]);

  if (!isOpen || !report) return null;

  const handleRevealPii = async () => {
    setRevealingPii(true);
    setPiiError(null);
    try {
      const data = await revealSensitiveDetails(report.id, token);
      setSensitive(data);
    } catch (err: any) {
      setPiiError(err.message || 'Failed to access sensitive PII');
    } finally {
      setRevealingPii(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setConflictError(null);
    setActionSuccess(null);
    try {
      await verifyReport(
        report.id,
        {
          status: verifyStatus,
          method: verifyMethod,
          confidence: Number(verifyConfidence),
          reason: verifyReason,
          expectedVersion: report.version,
        },
        token
      );
      setActionSuccess(`Case successfully marked as ${verifyStatus}!`);
      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          '⚠️ Someone else is currently handling or has already updated this case. Please refresh.'
        );
      } else {
        setConflictError(err.message || 'Verification failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setConflictError(null);
    try {
      await updateReportStatus(
        report.id,
        {
          newStatus: nextStatus,
          reason: statusReason,
          expectedVersion: report.version,
        },
        token
      );
      setActionSuccess(`Status transitioned to ${nextStatus}!`);
      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          '⚠️ Someone else is currently handling or has already updated this case. Please refresh.'
        );
      } else {
        setConflictError(err.message || 'Failed to update status');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setConflictError(null);
    try {
      await overridePriority(
        report.id,
        {
          overrideScore: Number(overrideScore),
          overrideReason,
          expectedVersion: report.version,
        },
        token
      );
      setActionSuccess(`Priority score successfully overridden to ${overrideScore}!`);
      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          '⚠️ Someone else is currently handling or has already updated this case. Please refresh.'
        );
      } else {
        setConflictError(err.message || 'Priority override failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setConflictError(null);
    try {
      await requestMoreInfo(
        report.id,
        {
          message: infoMessage,
          expectedVersion: report.version,
        },
        token
      );
      setActionSuccess('Information request successfully sent to reporter!');
      setInfoMessage('');
      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (err: any) {
      setConflictError(err.message || 'Failed to send info request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAssignment = async () => {
    setSubmitting(true);
    setConflictError(null);
    try {
      const isAssignedToMe = report.assignedResponderId === currentUserId;
      await assignResponder(
        report.id,
        isAssignedToMe ? null : currentUserId || 'current-responder',
        report.version,
        token
      );
      setActionSuccess(isAssignedToMe ? 'Case unassigned' : 'Case assigned to you');
      setTimeout(() => {
        onRefresh();
      }, 800);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError('⚠️ Case version mismatch. Someone else modified this record.');
      } else {
        setConflictError(err.message || 'Assignment failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isAssignedToMe = currentUserId && report.assignedResponderId === currentUserId;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-800/80 border-b border-slate-700 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-950 text-slate-300 rounded font-semibold border border-slate-700">
                {report.trackingCode}
              </span>
              <PriorityBadge score={report.priorityScore} breakdown={report.priorityBreakdown} />
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-900/60 text-blue-300 border border-blue-700">
                {report.status.replace('_', ' ')}
              </span>
              <span className="text-xs px-2 py-0.5 bg-slate-700/60 text-slate-300 rounded">
                v{report.version}
              </span>
              {report.corroborationCount > 1 && (
                <span className="text-xs px-2 py-0.5 bg-amber-900/60 text-amber-300 border border-amber-700 rounded-full font-semibold flex items-center gap-1">
                  <Flame className="w-3 h-3" /> {report.corroborationCount} Corroborating Reports
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white">{report.title}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAssignment}
              disabled={submitting}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                isAssignedToMe
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isAssignedToMe ? (
                <>
                  <Unlock className="w-3.5 h-3.5" /> Release Case
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Claim Case
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optimistic Locking Conflict Warning Banner */}
        {conflictError && (
          <div className="p-3 bg-red-950/80 border-b border-red-700 text-red-200 text-xs sm:text-sm font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{conflictError}</span>
            </div>
            <button
              onClick={onRefresh}
              className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-xs font-bold"
            >
              Refresh Case
            </button>
          </div>
        )}

        {/* Action Success Banner */}
        {actionSuccess && (
          <div className="p-3 bg-emerald-950/80 border-b border-emerald-700 text-emerald-200 text-xs sm:text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Incident Details Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Description
                </span>
                <p className="text-sm text-slate-200 mt-1 whitespace-pre-line">
                  {report.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-slate-300 pt-2 border-t border-slate-700/40">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>
                    <strong>{report.peopleAffectedCount}</strong> people affected
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>
                    Reported {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {report.vulnerableGroups && report.vulnerableGroups.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block mb-1">
                    Vulnerable Groups Present
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.vulnerableGroups.map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60 uppercase"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PII & Location Box */}
            <div className="space-y-3 border-t md:border-t-0 md:border-l border-slate-700/60 md:pl-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-red-400" /> Location
                </span>
                <p className="text-sm font-semibold text-slate-200 mt-1">
                  {report.approximateLocation}
                </p>
                <span className="text-xs text-slate-400 font-mono">
                  [{report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}]
                </span>
              </div>

              {/* Guarded PII Contact Box */}
              <div className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400" /> Sensitive PII
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Audited Access
                  </span>
                </div>

                {sensitive ? (
                  <div className="space-y-1.5 pt-1 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Exact Address:</span>
                      <span className="font-semibold text-slate-100">{sensitive.exactAddress}</span>
                    </div>
                    {sensitive.reporterName && (
                      <div>
                        <span className="text-slate-400 block text-[11px]">Reporter Name:</span>
                        <span className="font-semibold text-slate-100">{sensitive.reporterName}</span>
                      </div>
                    )}
                    {sensitive.reporterPhone && (
                      <div>
                        <span className="text-slate-400 block text-[11px]">Contact Phone:</span>
                        <a
                          href={`tel:${sensitive.reporterPhone}`}
                          className="font-bold text-emerald-400 hover:underline flex items-center gap-1 text-sm mt-0.5"
                        >
                          <Phone className="w-3.5 h-3.5" /> {sensitive.reporterPhone}
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">
                      Exact address and phone are encrypted to safeguard victims. Viewing logs an immutable audit entry.
                    </p>
                    {piiError && <p className="text-xs text-red-400 font-semibold">{piiError}</p>}
                    <button
                      type="button"
                      onClick={handleRevealPii}
                      disabled={revealingPii}
                      className="w-full py-2 px-3 bg-amber-600/90 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {revealingPii ? 'Decrypting & Auditing...' : 'Reveal Contact Details (Audited)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Tabs Navigation */}
          <div className="border-b border-slate-700 flex gap-2">
            <button
              onClick={() => setActiveTab('verify')}
              className={`pb-2.5 px-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'verify'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Verify / Reject
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`pb-2.5 px-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'status'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle className="w-4 h-4" /> State Transition
            </button>
            <button
              onClick={() => setActiveTab('override')}
              className={`pb-2.5 px-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'override'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" /> Override Priority
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`pb-2.5 px-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" /> Request Info
            </button>
            <button
              onClick={() => setActiveTab('matching')}
              className={`pb-2.5 px-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'matching'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" /> Aid Matching
            </button>
          </div>

          {/* Tab 1: Verification Form */}
          {activeTab === 'verify' && (
            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Verification Outcome
                  </label>
                  <select
                    value={verifyStatus}
                    onChange={(e) => setVerifyStatus(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="VERIFIED">VERIFIED (Confirmed Crisis)</option>
                    <option value="REJECTED">REJECTED (False / Spam / Duplicate)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Verification Method
                  </label>
                  <select
                    value={verifyMethod}
                    onChange={(e) => setVerifyMethod(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="PHONE_CALL">Phone Call</option>
                    <option value="ON_SITE_VISIT">On-Site First Responder Visit</option>
                    <option value="OFFICIAL_AGENCY">Official Agency (911/EMS Dispatch)</option>
                    <option value="PHOTO_METADATA">Photo Metadata & EXIF Analysis</option>
                    <option value="CROSS_REPORT_CORROBORATION">Cross-Report Corroboration</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Confidence Score: {verifyConfidence.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={verifyConfidence}
                  onChange={(e) => setVerifyConfidence(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Mandatory Reason / Field Notes <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={verifyReason}
                  onChange={(e) => setVerifyReason(e.target.value)}
                  placeholder="State how verification was achieved or why this incident is being rejected..."
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !verifyReason.trim()}
                className={`w-full py-3 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                  verifyStatus === 'VERIFIED'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                } disabled:opacity-50`}
              >
                {verifyStatus === 'VERIFIED' ? (
                  <>
                    <CheckCircle className="w-4 h-4" /> Confirm Verification
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" /> Reject Report
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab 2: State Transition Form */}
          {activeTab === 'status' && (
            <form onSubmit={handleStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Next Status
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="UNDER_REVIEW">UNDER_REVIEW (Active Triage)</option>
                  <option value="PRIORITIZED">PRIORITIZED (Queued for Aid Dispatch)</option>
                  <option value="IN_PROGRESS">IN_PROGRESS (Responder En Route)</option>
                  <option value="RESOLVED">RESOLVED (Aid Delivered)</option>
                  <option value="CLOSED">CLOSED (Incident Terminated)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Transition Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Context for dispatchers or responders..."
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Apply State Transition
              </button>
            </form>
          )}

          {/* Tab 3: Override Priority */}
          {activeTab === 'override' && (
            <form onSubmit={handleOverrideSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Custom Priority Score (0 - 100): <span className="font-mono text-amber-400">{overrideScore}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Mandatory Justification Note <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain field factors requiring manual priority score override..."
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !overrideReason.trim()}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold text-sm text-slate-950 flex items-center justify-center gap-2"
              >
                <Sliders className="w-4 h-4" /> Save Priority Override
              </button>
            </form>
          )}

          {/* Tab 4: Request More Info */}
          {activeTab === 'info' && (
            <form onSubmit={handleRequestInfoSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Message to Reporter <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={infoMessage}
                  onChange={(e) => setInfoMessage(e.target.value)}
                  placeholder="e.g. Are water levels continuing to rise? What floor are you located on?"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !infoMessage.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" /> Send Request to Case Timeline
              </button>
            </form>
          )}

          {/* Tab 5: Humanitarian Aid Matching */}
          {activeTab === 'matching' && (
            <div className="pt-2">
              <MatchingPanel
                reportId={report.id}
                reportTitle={report.title}
                reportTrackingCode={report.trackingCode}
                reportLatitude={report.latitude}
                reportLongitude={report.longitude}
                onMatchConfirmed={() => {
                  setActionSuccess('Aid match confirmed! Stock reserved and dispatched.');
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
