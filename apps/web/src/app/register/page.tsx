'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../context/I18nContext';
import { ShieldAlert, Building2, UserCheck, AlertTriangle, ArrowLeft } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function RegisterPage() {
  const { t } = useI18n();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'RESPONDER' | 'AID_PROVIDER'>('RESPONDER');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Registration failed.');
      }

      setSuccessMessage(
        'Registration submitted successfully! Please check your email to verify your account. For agency responders, admin approval is required before role access.'
      );
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            {t('auth.registerTitle')}
          </h1>
          <p className="text-xs text-slate-500">
            Join the verified responder network to coordinate emergency aid and rescue missions.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 rounded-xl text-xs flex items-center gap-2 font-medium"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-4 bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-semibold leading-relaxed"
          >
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Jane Doe / Capt. Alex Smith"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@disaster-agency.gov"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {t('auth.role')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('RESPONDER')}
                className={`p-3 rounded-xl border-2 text-start transition touch-target ${
                  role === 'RESPONDER'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-extrabold uppercase">Field Responder</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Verification & Dispatch</div>
              </button>

              <button
                type="button"
                onClick={() => setRole('AID_PROVIDER')}
                className={`p-3 rounded-xl border-2 text-start transition touch-target ${
                  role === 'AID_PROVIDER'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-extrabold uppercase">Aid Provider / NGO</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Shelters & Resources</div>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="orgName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {t('auth.orgName')}
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g., Red Cross, Regional Search & Rescue"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="p-3 bg-slate-100 dark:bg-slate-900/60 rounded-xl text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-bold block text-slate-800 dark:text-slate-200">
              Vetting Notice:
            </span>
            To prevent fraud and protect crisis victims, accounts requesting responder or aid-provider privileges undergo manual document verification by regional coordinators before authorization is granted.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow touch-target flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{t('auth.submitRegister')}</span>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
          <Link
            href="/login"
            className="text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>{t('auth.haveAccount')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
