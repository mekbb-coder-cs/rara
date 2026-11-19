'use client';

import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { AlertTriangle, PhoneCall } from 'lucide-react';

export function EmergencyBanner() {
  const { t } = useI18n();

  return (
    <aside
      role="alert"
      aria-label="Emergency warning"
      className="bg-red-800 text-white font-medium px-4 py-3 shadow-md border-b-2 border-red-900 sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-start">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-300" aria-hidden="true" />
          <p className="text-sm md:text-base leading-snug">
            {t('emergency.banner')}
          </p>
        </div>
        <a
          href="tel:911"
          className="inline-flex items-center justify-center gap-2 bg-white text-red-800 hover:bg-red-50 font-bold px-4 py-2 rounded-lg text-sm shadow transition-colors touch-target flex-shrink-0 border border-white"
          aria-label="Call emergency services 911"
        >
          <PhoneCall className="w-4 h-4 text-red-800" aria-hidden="true" />
          <span>{t('emergency.call911')}</span>
        </a>
      </div>
    </aside>
  );
}
