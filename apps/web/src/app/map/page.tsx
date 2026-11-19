'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '../../context/I18nContext';

// Dynamically import CrisisMap with ssr: false so Leaflet never touches Node server
const DynamicCrisisMap = dynamic(
  () => import('../../components/map/CrisisMap').then((mod) => mod.CrisisMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-100 dark:bg-slate-900 min-h-[500px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
          Loading OpenStreetMap tiles and crisis feed...
        </p>
      </div>
    ),
  }
);

export default function MapPage() {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
          {t('map.title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {t('map.subtitle')}
        </p>
      </div>
      <DynamicCrisisMap />
    </div>
  );
}
