'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ShieldAlert,
  Users,
  FileText,
  Lock,
  Download,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Database,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import * as api from '../../lib/api';
import {
  SystemConfig,
  PriorityWeightsConfig,
  DuplicateClusteringConfig,
  EscalationThresholdsConfig,
  AdminUserItem,
  AuditLogItem,
  RetentionRunResult,
} from '../../lib/types';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    'priority' | 'clustering' | 'flags' | 'users' | 'audit' | 'compliance'
  >('priority');

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Priority Weights State
  const [weights, setWeights] = useState<PriorityWeightsConfig>({
    weightSeverity: 3.5,
    weightPeople: 2.5,
    weightVulnerability: 2.5,
    weightWaitingTime: 1.5,
  });

  // Duplicate Clustering State
  const [clustering, setClustering] = useState<DuplicateClusteringConfig>({
    radiusMeters: 500,
    timeWindowMinutes: 60,
    textSimilarityThreshold: 0.65,
  });

  // Escalation Thresholds State
  const [escalation, setEscalation] = useState<EscalationThresholdsConfig>({
    defaultUnverifiedMinutes: 30,
    defaultUnmatchedMinutes: 60,
  });

  // Feature Flags State
  const [flags, setFlags] = useState<Record<string, boolean>>({
    enableVolunteerTracking: true,
    enableSmsAlerts: true,
    enableAutoEscalationJob: true,
    enableRetentionAutoAnonymize: true,
    maintenanceMode: false,
  });

  // Users State
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [userSearch, setUserSearch] = useState<string>('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditFilterAction, setAuditFilterAction] = useState<string>('ALL');

  // Compliance State
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [retentionResult, setRetentionResult] = useState<RetentionRunResult | null>(null);
  const [runningRetention, setRunningRetention] = useState<boolean>(false);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [complianceActionMsg, setComplianceActionMsg] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const getAuthToken = () => {
    return typeof window !== 'undefined' ? localStorage.getItem('relieflink_token') || undefined : undefined;
  };

  const loadAllData = async () => {
    setLoading(true);
    setStatusMessage(null);
    const token = getAuthToken();
    try {
      const [sysConfig, usersList, logsList] = await Promise.all([
        api.getSystemConfig(token).catch(() => null),
        api.listAdminUsers(token).catch(() => []),
        api.getAdminAuditLogs(undefined, token).catch(() => []),
      ]);

      if (sysConfig) {
        setConfig(sysConfig);
        setWeights(sysConfig.priorityWeights);
        setClustering(sysConfig.duplicateClustering);
        setEscalation(sysConfig.escalationThresholds);
        setFlags(sysConfig.featureFlags);
      }
      setUsers(usersList);
      setAuditLogs(logsList);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to load admin settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 1. Save Priority Weights
  const handleSaveWeights = async () => {
    setStatusMessage(null);
    try {
      const updated = await api.updatePriorityWeights(weights, getAuthToken());
      setWeights(updated);
      setStatusMessage({ text: 'Priority weights updated & audit logged successfully!', type: 'success' });
      // Reload audit logs to reflect the change
      const refreshedLogs = await api.getAdminAuditLogs(undefined, getAuthToken());
      setAuditLogs(refreshedLogs);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update priority weights', type: 'error' });
    }
  };

  // 2. Save Duplicate Clustering
  const handleSaveClustering = async () => {
    setStatusMessage(null);
    try {
      const updated = await api.updateDuplicateClustering(clustering, getAuthToken());
      setClustering(updated);
      setStatusMessage({ text: 'Duplicate clustering configuration saved!', type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update clustering config', type: 'error' });
    }
  };

  // 3. Save Escalation Thresholds
  const handleSaveEscalation = async () => {
    setStatusMessage(null);
    try {
      const updated = await api.updateEscalationThresholds(escalation, getAuthToken());
      setEscalation(updated);
      setStatusMessage({ text: 'Escalation thresholds saved!', type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update escalation thresholds', type: 'error' });
    }
  };

  // 4. Toggle Feature Flag
  const handleToggleFlag = async (flagKey: string) => {
    const updatedFlags = { ...flags, [flagKey]: !flags[flagKey] };
    setFlags(updatedFlags);
    try {
      await api.updateFeatureFlags(updatedFlags, getAuthToken());
      setStatusMessage({ text: `Feature flag "${flagKey}" updated!`, type: 'success' });
    } catch (err: any) {
      setFlags(flags); // revert
      setStatusMessage({ text: err.message || 'Failed to update flag', type: 'error' });
    }
  };

  // 5. Update User Role
  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await api.updateAdminUser(userId, { role: newRole }, getAuthToken());
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setStatusMessage({ text: `User role updated to ${newRole}!`, type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update user role', type: 'error' });
    }
  };

  // 6. Toggle User Verified Responder
  const handleToggleResponderVerified = async (userId: string, currentStatus: boolean) => {
    try {
      await api.updateAdminUser(userId, { isVerifiedResponder: !currentStatus }, getAuthToken());
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isVerifiedResponder: !currentStatus } : u))
      );
      setStatusMessage({ text: `Responder verification updated!`, type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update responder status', type: 'error' });
    }
  };

  // 7. Trigger Retention Anonymization
  const handleRunRetentionJob = async () => {
    setRunningRetention(true);
    setComplianceActionMsg(null);
    try {
      const result = await api.triggerRetentionJob(retentionDays, getAuthToken());
      setRetentionResult(result);
      setComplianceActionMsg(
        `Retention scan completed: ${result.scannedCount} scanned, ${result.anonymizedCount} anonymized.`
      );
    } catch (err: any) {
      setComplianceActionMsg(`Error running retention job: ${err.message}`);
    } finally {
      setRunningRetention(false);
    }
  };

  // 8. GDPR User Data Export
  const handleExportUserData = async () => {
    if (!targetUserId.trim()) return;
    try {
      const data = await api.exportUserData(targetUserId.trim(), getAuthToken());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data-export-${targetUserId}.json`;
      a.click();
      setComplianceActionMsg(`User data exported successfully.`);
    } catch (err: any) {
      setComplianceActionMsg(`Export error: ${err.message}`);
    }
  };

  // 9. GDPR User Data Erasure
  const handleDeleteUserData = async () => {
    if (!targetUserId.trim()) return;
    if (!confirm(`Are you sure you want to permanently delete user ${targetUserId} and anonymize their data?`)) {
      return;
    }
    try {
      const res = await api.deleteUserData(targetUserId.trim(), getAuthToken());
      setComplianceActionMsg(`GDPR Right to Erasure complete: ${res.message}`);
    } catch (err: any) {
      setComplianceActionMsg(`Erasure error: ${err.message}`);
    }
  };

  // Calculate live formula preview score
  const sampleScore = (
    1.0 * weights.weightSeverity +
    0.6 * weights.weightPeople +
    0.8 * weights.weightVulnerability +
    0.5 * weights.weightWaitingTime
  ).toFixed(2);

  const filteredLogs = auditLogs.filter((log) => {
    if (auditFilterAction === 'ALL') return true;
    return log.action === auditFilterAction;
  });

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (
      (u.fullName && u.fullName.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.phoneNumber && u.phoneNumber.includes(term)) ||
      u.role.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Admin & Governance Control Center
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Configure priority scoring weights, clustering SLAs, RBAC access, privacy compliance, and audit logs.
            </p>
          </div>

          <button
            onClick={loadAllData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh All</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-semibold ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          {[
            { id: 'priority', label: 'Priority Weights', icon: Sliders },
            { id: 'clustering', label: 'Clustering & SLA', icon: Database },
            { id: 'flags', label: 'Feature Flags', icon: ToggleRight },
            { id: 'users', label: 'User Roles & Responders', icon: Users },
            { id: 'audit', label: 'Audit Log Viewer', icon: FileText },
            { id: 'compliance', label: 'Privacy & GDPR Compliance', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ====================================================
            TAB 1: PRIORITY WEIGHTS
            ==================================================== */}
        {activeTab === 'priority' && (
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Crisis Triage Priority Formula</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Adjust multipliers for severity, population affected, vulnerable groups, and waiting stall time.
                </p>
              </div>

              <button
                id="save-priority-weights-btn"
                onClick={handleSaveWeights}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md transition"
              >
                <Save className="w-4 h-4" />
                <span>Save Priority Weights</span>
              </button>
            </div>

            {/* Formula Simulator Card */}
            <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-xl border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase font-bold text-blue-700 dark:text-blue-400">Live Formula Preview</span>
                <p className="font-mono text-sm text-slate-800 dark:text-slate-200 mt-1">
                  Score = (Sev × <strong>{weights.weightSeverity}</strong>) + (People × <strong>{weights.weightPeople}</strong>) + (Vuln × <strong>{weights.weightVulnerability}</strong>) + (Wait × <strong>{weights.weightWaitingTime}</strong>)
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Sample High Incident Score</span>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
                  {sampleScore} pts
                </div>
              </div>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Severity Weight */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="weightSeverity" className="text-sm font-bold text-slate-900 dark:text-white">
                    Severity Multiplier
                  </label>
                  <span className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                    {weights.weightSeverity.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  id="weightSeverity"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={weights.weightSeverity}
                  onChange={(e) => setWeights({ ...weights, weightSeverity: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <p className="text-xs text-slate-500">
                  Weight applied to CRITICAL, HIGH, MEDIUM, LOW severity hazard assessments.
                </p>
              </div>

              {/* People Affected Weight */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="weightPeople" className="text-sm font-bold text-slate-900 dark:text-white">
                    People Affected Multiplier
                  </label>
                  <span className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                    {weights.weightPeople.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  id="weightPeople"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={weights.weightPeople}
                  onChange={(e) => setWeights({ ...weights, weightPeople: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <p className="text-xs text-slate-500">
                  Weight applied to log10 scaled human casualty / displacement counts.
                </p>
              </div>

              {/* Vulnerability Weight */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="weightVulnerability" className="text-sm font-bold text-slate-900 dark:text-white">
                    Vulnerable Groups Multiplier
                  </label>
                  <span className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                    {weights.weightVulnerability.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  id="weightVulnerability"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={weights.weightVulnerability}
                  onChange={(e) => setWeights({ ...weights, weightVulnerability: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <p className="text-xs text-slate-500">
                  Weight applied when children, elderly, pregnant women, or injured are trapped.
                </p>
              </div>

              {/* Waiting Time Weight */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="weightWaitingTime" className="text-sm font-bold text-slate-900 dark:text-white">
                    Waiting Time Multiplier
                  </label>
                  <span className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                    {weights.weightWaitingTime.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  id="weightWaitingTime"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={weights.weightWaitingTime}
                  onChange={(e) => setWeights({ ...weights, weightWaitingTime: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <p className="text-xs text-slate-500">
                  Weight escalation multiplier preventing older unresolved tickets from stalling.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 2: CLUSTERING & SLA
            ==================================================== */}
        {activeTab === 'clustering' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Duplicate Clustering */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Duplicate Detection Clustering</h3>
              <p className="text-xs text-slate-500">
                Spatial radius and time window within which incoming reports are grouped into a single crisis cluster.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Cluster Radius (Meters)</label>
                  <input
                    type="number"
                    value={clustering.radiusMeters}
                    onChange={(e) => setClustering({ ...clustering, radiusMeters: parseInt(e.target.value) || 500 })}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Time Window (Minutes)</label>
                  <input
                    type="number"
                    value={clustering.timeWindowMinutes}
                    onChange={(e) => setClustering({ ...clustering, timeWindowMinutes: parseInt(e.target.value) || 60 })}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <button
                  onClick={handleSaveClustering}
                  className="w-full mt-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow transition"
                >
                  Save Clustering Rules
                </button>
              </div>
            </div>

            {/* Escalation Thresholds */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Escalation SLA Thresholds</h3>
              <p className="text-xs text-slate-500">
                Maximum time a crisis report can remain unverified or unmatched before raising an automated alert.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Unverified Stall Threshold (Minutes)</label>
                  <input
                    type="number"
                    value={escalation.defaultUnverifiedMinutes}
                    onChange={(e) => setEscalation({ ...escalation, defaultUnverifiedMinutes: parseInt(e.target.value) || 30 })}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Unmatched Need Stall Threshold (Minutes)</label>
                  <input
                    type="number"
                    value={escalation.defaultUnmatchedMinutes}
                    onChange={(e) => setEscalation({ ...escalation, defaultUnmatchedMinutes: parseInt(e.target.value) || 60 })}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <button
                  onClick={handleSaveEscalation}
                  className="w-full mt-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow transition"
                >
                  Save Escalation SLA
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 3: FEATURE FLAGS
            ==================================================== */}
        {activeTab === 'flags' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">System Feature Flags</h2>
            <p className="text-xs text-slate-500">
              Enable or disable platform capabilities in real-time across Tigray dispatch operations.
            </p>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-2">
              {[
                { key: 'enableVolunteerTracking', label: 'Live Volunteer Location Tracking', desc: 'Allows field volunteers to share live GPS coordinates on assigned tasks.' },
                { key: 'enableSmsAlerts', label: 'SMS Gateway Dispatch', desc: 'Sends SMS alerts to responders & reporters (sandbox/Africa’s Talking).' },
                { key: 'enableAutoEscalationJob', label: 'BullMQ Automated Escalation Watcher', desc: 'Scans queue periodically and flags stalled emergency tickets.' },
                { key: 'enableRetentionAutoAnonymize', label: 'Nightly GDPR Retention Anonymization', desc: 'Automatically scrubs reporter PII on closed cases older than policy window.' },
                { key: 'maintenanceMode', label: 'Maintenance Mode', desc: 'Temporarily pauses public submissions while allowing emergency triage.' },
              ].map((flag) => {
                const isEnabled = !!flags[flag.key];
                return (
                  <div key={flag.key} className="py-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block">{flag.label}</span>
                      <span className="text-xs text-slate-500">{flag.desc}</span>
                    </div>
                    <button
                      onClick={() => handleToggleFlag(flag.key)}
                      className={`text-2xl transition ${isEnabled ? 'text-blue-600' : 'text-slate-400'}`}
                    >
                      {isEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 4: USER & ROLE MANAGEMENT
            ==================================================== */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">User & Role Management</h2>
                <p className="text-xs text-slate-500">
                  Assign administrative, coordinator, or responder roles and verify humanitarian credentials.
                </p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-extrabold text-slate-500">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Verified Responder</th>
                    <th className="py-3 px-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 dark:text-white block">{user.fullName || 'User'}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{user.email || user.phoneNumber || user.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={user.role}
                          onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                        >
                          <option value="CIVILIAN">CIVILIAN</option>
                          <option value="RESPONDER">RESPONDER</option>
                          <option value="COORDINATOR">COORDINATOR</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleResponderVerified(user.id, user.isVerifiedResponder)}
                          className={`px-3 py-1 rounded-lg font-bold text-[11px] transition ${
                            user.isVerifiedResponder
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {user.isVerifiedResponder ? 'Verified' : 'Unverified'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 5: AUDIT LOG VIEWER
            ==================================================== */}
        {activeTab === 'audit' && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Audit & Compliance Trail</h2>
                <p className="text-xs text-slate-500">
                  Immutable record of who accessed which sensitive field or modified configuration settings.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                >
                  <option value="ALL">All Actions</option>
                  <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
                  <option value="REPORT_TRIAGE">REPORT_TRIAGE</option>
                  <option value="SENSITIVE_VIEW">SENSITIVE_VIEW</option>
                  <option value="USER_UPDATE">USER_UPDATE</option>
                  <option value="DATA_RETENTION_ANONYMIZED">DATA_RETENTION_ANONYMIZED</option>
                </select>

                <a
                  href={api.getAuditLogsExportCsvUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-extrabold text-slate-500">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Before / After Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                  {filteredLogs.slice(0, 50).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                        {log.userName || log.userId?.slice(0, 8) || 'SYSTEM'} ({log.userRole || 'SVC'})
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {log.entityName} #{log.entityId?.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs truncate">
                        {log.metadata ? JSON.stringify(log.metadata) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB 6: PRIVACY & GDPR COMPLIANCE
            ==================================================== */}
        {activeTab === 'compliance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Automatic Retention Policy Runner */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Data Retention Policy Runner</h3>
              <p className="text-xs text-slate-500">
                Anonymize old closed reports (&gt; {retentionDays} days) by redacting exact phone numbers, reporter names, and street addresses.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Retention Threshold (Days)</label>
                  <input
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <button
                  onClick={handleRunRetentionJob}
                  disabled={runningRetention}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow transition disabled:opacity-50"
                >
                  {runningRetention ? 'Running Anonymization Job...' : 'Run Retention Job Now'}
                </button>

                {retentionResult && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Scanned: {retentionResult.scannedCount} | Anonymized: {retentionResult.anonymizedCount} reports.
                  </div>
                )}
              </div>
            </div>

            {/* GDPR User Data Portability & Erasure */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">GDPR Subject Access & Erasure</h3>
              <p className="text-xs text-slate-500">
                Fulfill Article 15/20 data portability export or Article 17 right to erasure requests.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Target User ID</label>
                  <input
                    type="text"
                    placeholder="Enter UUID of user"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="w-full mt-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExportUserData}
                    className="py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 transition"
                  >
                    Export Data (JSON)
                  </button>

                  <button
                    onClick={handleDeleteUserData}
                    className="py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition"
                  >
                    Erase User (GDPR)
                  </button>
                </div>

                {complianceActionMsg && (
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-300">
                    {complianceActionMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
