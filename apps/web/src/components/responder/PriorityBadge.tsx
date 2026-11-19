'use client';

import React, { useState } from 'react';
import { PriorityBreakdown } from '../../lib/types';
import { ShieldAlert, Info, Flame } from 'lucide-react';

interface PriorityBadgeProps {
  score: number;
  breakdown?: PriorityBreakdown | null;
  showDetails?: boolean;
}

export function PriorityBadge({ score, breakdown, showDetails = false }: PriorityBadgeProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const getScoreColor = (val: number) => {
    if (val >= 80) return 'bg-red-600 text-white border-red-700';
    if (val >= 60) return 'bg-orange-500 text-white border-orange-600';
    if (val >= 40) return 'bg-amber-500 text-slate-900 border-amber-600';
    return 'bg-emerald-600 text-white border-emerald-700';
  };

  const getScoreLabel = (val: number) => {
    if (val >= 80) return 'CRITICAL';
    if (val >= 60) return 'HIGH';
    if (val >= 40) return 'MEDIUM';
    return 'STANDARD';
  };

  const isOverride = breakdown?.isOverride;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setPopoverOpen(!popoverOpen)}
        onMouseEnter={() => setPopoverOpen(true)}
        onMouseLeave={() => setPopoverOpen(false)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm transition-all hover:scale-105 ${getScoreColor(
          score
        )}`}
        aria-label={`Priority score ${score.toFixed(1)}: ${getScoreLabel(score)}`}
      >
        {score >= 80 ? <Flame className="w-3.5 h-3.5 animate-pulse" /> : <ShieldAlert className="w-3.5 h-3.5" />}
        <span>P{score.toFixed(1)}</span>
        <span className="opacity-90 font-semibold text-[10px]">({getScoreLabel(score)})</span>
        {isOverride && (
          <span className="ml-0.5 px-1 py-0.2 bg-black/30 rounded text-[9px] uppercase tracking-wider">
            Override
          </span>
        )}
      </button>

      {/* Breakdown Popover */}
      {popoverOpen && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3.5 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl shadow-2xl text-xs space-y-2 pointer-events-none">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-200 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-400" /> Explainable Priority Formula
            </span>
            <span className="font-mono font-black text-amber-400 text-sm">
              Score: {score.toFixed(1)}/100
            </span>
          </div>

          {isOverride ? (
            <div className="p-2 bg-amber-950/60 border border-amber-700/50 rounded text-amber-200">
              <div className="font-semibold text-[11px] text-amber-400">Manual Responder Override</div>
              <div className="italic text-[10px] mt-0.5">"{breakdown?.overrideReason}"</div>
            </div>
          ) : (
            <div className="space-y-1 text-slate-300">
              <div className="text-[10px] text-slate-400 font-mono">
                P = min(100, [w_s·S + w_p·f(N) + w_v·V + w_t·g(T)] × H × C)
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[11px]">
                <div>
                  <span className="text-slate-400">Severity (S):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.severityScore ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Affected f(N):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.peopleFactor ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Vulnerable (V):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.vulnerabilityScore ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Waiting g(T):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.timeFactor ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Hazard Mult (H):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.hazardMultiplier ?? '1.0'}x</span>
                </div>
                <div>
                  <span className="text-slate-400">Confidence (C):</span>{' '}
                  <span className="font-mono text-slate-200">{breakdown?.confidenceMultiplier ?? '1.0'}x</span>
                </div>
              </div>
            </div>
          )}

          <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800">
            Higher scores escalate case up the live responder triage queue.
          </div>
        </div>
      )}
    </div>
  );
}
