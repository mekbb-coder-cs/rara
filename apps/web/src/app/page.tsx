'use client';

import React from 'react';
import Link from 'next/link';
import { useI18n } from '../context/I18nContext';
import { useNetwork } from '../context/NetworkContext';
import {
  AlertCircle,
  MapPin,
  Search,
  WifiOff,
  ShieldCheck,
  LifeBuoy,
  PhoneCall,
  Clock,
} from 'lucide-react';

export default function HomePage() {
  const { t } = useI18n();
  const { isOnline, pendingCount } = useNetwork();

  return (
    <div className="flex-1 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      {/* Offline Alert Box if offline */}
      {!isOnline && (
        <div
          role="status"
          className="mb-8 p-4 bg-amber-500/10 border-2 border-amber-600 rounded-xl text-amber-900 dark:text-amber-200 flex items-center gap-3"
        >
          <WifiOff className="w-6 h-6 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <h2 className="font-bold text-base">You are currently offline</h2>
            <p className="text-sm">
              Don’t worry: you can still submit emergency reports. They will be saved securely on your device and sent automatically as soon as cell signal or Wi-Fi returns.
              {pendingCount > 0 && ` (${pendingCount} reports currently queued)`}
            </p>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-4 mb-12">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <LifeBuoy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Community Crisis Response Network
        </span>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
          Rapid Help in Emergencies & Disasters
        </h1>
        <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 font-normal">
          Report floods, fires, medical crises, and essential relief needs. Connected directly to local volunteer responders, NGOs, and humanitarian organizations.
        </p>
      </section>

      {/* Primary Action Cards Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {/* Card 1: Report Help Now (Primary Urgent Action) */}
        <div className="bg-white dark:bg-slate-800 border-2 border-red-600 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-black uppercase px-3 py-1 rounded-bl-lg">
            Urgent Action
          </div>
          <div className="space-y-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950/60 rounded-xl flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Report an Emergency
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              Submit a quick crisis report in 4 simple steps. Works completely offline. Anonymous reporting supported.
            </p>
          </div>
          <div className="mt-8">
            <Link
              href="/report"
              className="w-full inline-flex items-center justify-center px-6 py-4 rounded-xl font-extrabold text-base text-white bg-red-700 hover:bg-red-800 active:bg-red-900 transition-colors shadow-lg touch-target text-center"
            >
              Request Emergency Help Now &rarr;
            </Link>
          </div>
        </div>

        {/* Card 2: Live Crisis Map */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-md hover:shadow-lg transition-shadow">
          <div className="space-y-4">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
              <MapPin className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Crisis & Shelter Map
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              View verified incidents, active hazard zones, emergency shelters, and food/water distribution points in your area.
            </p>
          </div>
          <div className="mt-8">
            <Link
              href="/map"
              className="w-full inline-flex items-center justify-center px-6 py-4 rounded-xl font-bold text-base text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-slate-700/60 hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors touch-target text-center border border-blue-200 dark:border-slate-600"
            >
              Open Live Crisis Map
            </Link>
          </div>
        </div>

        {/* Card 3: Track Existing Report */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-md hover:shadow-lg transition-shadow">
          <div className="space-y-4">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Search className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Track Your Report
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              Have a tracking code (e.g. RL-XXXX-XX)? Check responder verification, priority rating, and live timeline status.
            </p>
          </div>
          <div className="mt-8">
            <Link
              href="/track"
              className="w-full inline-flex items-center justify-center px-6 py-4 rounded-xl font-bold text-base text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-slate-700/60 hover:bg-emerald-100 dark:hover:bg-slate-700 transition-colors touch-target text-center border border-emerald-200 dark:border-slate-600"
            >
              Track Case by Code
            </Link>
          </div>
        </div>
      </section>

      {/* Safety & Trust Pillars */}
      <section className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-10 mb-8">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 text-center">
          How ReliefLink Keeps Communities Safe
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="flex gap-4">
            <PhoneCall className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white">Life-Threatening Crises</h4>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                ReliefLink supplements official services during overload. For immediate life danger, call 911 or local emergency services without delay.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShieldCheck className="w-6 h-6 text-blue-600 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white">Strict Privacy by Design</h4>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Your exact street address and phone number are hidden from public view. Only vetted, approved responders can view sensitive data.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Clock className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white">Resilient Offline Mode</h4>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                If telecommunications towers collapse or power goes out, your reports stay queued locally and synchronize as soon as any signal connects.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
