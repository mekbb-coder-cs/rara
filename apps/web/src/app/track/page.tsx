'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '../../context/I18nContext';
import { fetchReportTimeline } from '../../lib/api';
import { ReportTimelineResponse, ReportStatus } from '../../lib/types';
import {
  Search,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Calendar,
  Send,
} from 'lucide-react';

const STATUS_ORDER: ReportStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'IN_PROGRESS',
  'RESOLVED',
];

function TrackReportContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const [inputCode, setInputCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ReportTimelineResponse | null>(null);
  const [searched, setSearched] = useState<boolean>(false);

  const handleSearch = async (codeToSearch: string) => {
    const code = codeToSearch.trim();
    if (!code) return;

    setLoading(true);
    setSearched(true);
    try {
      const result = await fetchReportTimeline(code);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const codeFromQuery = searchParams.get('code');
    if (codeFromQuery) {
      setInputCode(codeFromQuery);
      handleSearch(codeFromQuery);
    }
  }, [searchParams]);

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
      case 'UNDER_REVIEW':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300';
      case 'VERIFIED':
      case 'PRIORITIZED':
      case 'MATCHED':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300';
      case 'IN_PROGRESS':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300';
      case 'REJECTED':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Search Bar Header */}
      <div className="text-center space-y-3">
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
          {t('track.title')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
          Enter your unique tracking code to check the status of your case, responder notes, and relief dispatch updates.
        </p>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(inputCode);
          }}
          className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto pt-4"
        >
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              required
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder={t('track.placeholder')}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold uppercase tracking-wider focus:border-blue-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow touch-target flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{t('track.search')}</span>
            )}
          </button>
        </form>
      </div>

      {/* Results View */}
      {searched && !loading && (
        <>
          {!data ? (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center space-y-3 shadow-md">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('track.notFound')}
              </h2>
              <p className="text-sm text-slate-500">
                If you recently submitted this report offline, it will appear here once your device reconnects to the network and synchronizes.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Tracking Code
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-mono font-black text-blue-600 dark:text-blue-400">
                      {data.report.trackingCode}
                    </h2>
                  </div>
                  <div
                    className={`px-4 py-2 rounded-xl text-sm font-extrabold uppercase tracking-wide border ${getStatusColor(
                      data.report.status
                    )}`}
                  >
                    {data.report.status.replace('_', ' ')}
                  </div>
                </div>

                {/* Key Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Incident Type</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {data.report.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Severity</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {data.report.severity}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">People Affected</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {data.report.affectedCount} individuals
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Reported At</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {new Date(data.report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Location snippet */}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pt-2">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span>General Location: <strong>{data.report.address}</strong></span>
                </div>

                {/* Progress Stepper on Lifecycle */}
                <div className="pt-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                    <span>Submitted</span>
                    <span>Review</span>
                    <span>Verified</span>
                    <span>Dispatched</span>
                    <span>Resolved</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all"
                      style={{
                        width:
                          data.report.status === 'SUBMITTED'
                            ? '20%'
                            : data.report.status === 'UNDER_REVIEW'
                            ? '40%'
                            : data.report.status === 'VERIFIED'
                            ? '60%'
                            : data.report.status === 'IN_PROGRESS'
                            ? '80%'
                            : data.report.status === 'RESOLVED' || data.report.status === 'CLOSED'
                            ? '100%'
                            : '20%',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Timeline Section */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span>{t('track.timeline')}</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold">
                    {data.updates.length} updates logged
                  </span>
                </div>

                {data.updates.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    {t('track.noUpdates')}
                  </p>
                ) : (
                  <div className="space-y-4 border-l-2 border-slate-200 dark:border-slate-700 pl-4 sm:pl-6 ml-2">
                    {data.updates.map((update) => (
                      <div key={update.id} className="relative space-y-1">
                        {/* Dot indicator */}
                        <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white dark:border-slate-800" />
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {update.authorType === 'RESPONDER'
                              ? update.authorName || 'Verified Responder'
                              : update.authorType === 'SYSTEM'
                              ? 'ReliefLink System'
                              : 'Reporter'}
                          </span>
                          <span>•</span>
                          <span>{new Date(update.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                          {update.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">
          Loading report tracking...
        </div>
      }
    >
      <TrackReportContent />
    </Suspense>
  );
}
