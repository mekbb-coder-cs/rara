'use client';

import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { ShieldCheck, Heart } from 'lucide-react';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="mt-auto bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 py-8 px-4 sm:px-6 lg:px-8 text-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-col items-center md:items-start gap-1">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <ShieldCheck className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <span>ReliefLink Crisis Coordination System</span>
          </div>
          <p className="text-xs text-slate-500">
            Open crisis response, privacy-protected incident verification, and humanitarian aid matching.
          </p>
        </div>

        <div className="text-center md:text-end text-xs space-y-1">
          <p>
            Emergency? Always call <strong>907 (Ambulance)</strong> or <strong>991 (Police)</strong> first.
          </p>
          <p className="flex items-center justify-center md:justify-end gap-1 text-slate-500">
            <span>Built with care for crisis survivors & responders</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" aria-hidden="true" />
          </p>
        </div>
      </div>
    </footer>
  );
}
