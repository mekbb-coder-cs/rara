'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../context/I18nContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  IncidentType,
  SeverityLevel,
  ReportFormData,
} from '../../lib/types';
import { submitReport } from '../../lib/api';
import { compressImage } from '../../lib/imageCompression';
import {
  AlertTriangle,
  Flame,
  Droplets,
  HeartPulse,
  UserX,
  Apple,
  Home,
  ShieldBan,
  HelpCircle,
  MapPin,
  LocateFixed,
  Users,
  Camera,
  CheckCircle2,
  Copy,
  ArrowRight,
  ArrowLeft,
  WifiOff,
  Clock,
} from 'lucide-react';

const INCIDENT_TYPES: { type: IncidentType; labelKey: string; icon: React.ElementType; color: string }[] = [
  { type: 'FLOOD', labelKey: 'type.FLOOD', icon: Droplets, color: 'text-blue-600 dark:text-blue-400' },
  { type: 'FIRE', labelKey: 'type.FIRE', icon: Flame, color: 'text-orange-600 dark:text-orange-400' },
  { type: 'MEDICAL', labelKey: 'type.MEDICAL', icon: HeartPulse, color: 'text-red-600 dark:text-red-400' },
  { type: 'MISSING_PERSON', labelKey: 'type.MISSING_PERSON', icon: UserX, color: 'text-purple-600 dark:text-purple-400' },
  { type: 'FOOD_WATER', labelKey: 'type.FOOD_WATER', icon: Apple, color: 'text-emerald-600 dark:text-emerald-400' },
  { type: 'SHELTER', labelKey: 'type.SHELTER', icon: Home, color: 'text-indigo-600 dark:text-indigo-400' },
  { type: 'ROAD_BLOCKED', labelKey: 'type.ROAD_BLOCKED', icon: ShieldBan, color: 'text-amber-600 dark:text-amber-400' },
  { type: 'OTHER', labelKey: 'type.OTHER', icon: HelpCircle, color: 'text-slate-600 dark:text-slate-400' },
];

const SEVERITIES: { level: SeverityLevel; labelKey: string; badgeColor: string }[] = [
  { level: 'LOW', labelKey: 'severity.LOW', badgeColor: 'border-slate-300 dark:border-slate-700 hover:border-slate-400' },
  { level: 'MEDIUM', labelKey: 'severity.MEDIUM', badgeColor: 'border-yellow-400 dark:border-yellow-600 hover:border-yellow-500' },
  { level: 'HIGH', labelKey: 'severity.HIGH', badgeColor: 'border-orange-500 dark:border-orange-600 hover:border-orange-600' },
  { level: 'CRITICAL', labelKey: 'severity.CRITICAL', badgeColor: 'border-red-500 dark:border-red-600 hover:border-red-600' },
  { level: 'LIFE_THREATENING', labelKey: 'severity.LIFE_THREATENING', badgeColor: 'border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' },
];

const VULNERABLE_OPTIONS = [
  { id: 'children', labelKey: 'vulnerable.children' },
  { id: 'elderly', labelKey: 'vulnerable.elderly' },
  { id: 'disabled', labelKey: 'vulnerable.disabled' },
  { id: 'pregnant', labelKey: 'vulnerable.pregnant' },
];

export function ReportWizard() {
  const { t } = useI18n();
  const { isOnline, refreshPendingCount } = useNetwork();

  // Wizard Step: 1, 2, 3, 4, or 5 (Success)
  const [step, setStep] = useState<number>(1);
  const [step4EnteredAt, setStep4EnteredAt] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<ReportFormData>({
    type: 'FLOOD',
    description: '',
    severity: 'HIGH',
    affectedCount: 1,
    vulnerableGroups: [],
    latitude: 25.7617,
    longitude: -80.1918,
    address: '',
    contactPhone: '',
    isAnonymous: false,
    honeypot: '',
    mediaUrls: [],
  });

  // Compression status info
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);

  // Success State
  const [submissionResult, setSubmissionResult] = useState<{
    trackingCode: string;
    savedOffline: boolean;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Step 1: Hazard Type & Description Validation
  const validateStep1 = (): boolean => {
    if (!formData.type) {
      setErrorMessage('Please select a hazard type.');
      return false;
    }
    if (formData.description.trim().length < 10) {
      setErrorMessage('Please provide a brief description of what is happening (at least 10 characters).');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Step 2: Location Validation
  const validateStep2 = (): boolean => {
    if (!formData.address.trim()) {
      setErrorMessage('Please provide an address, landmark, or location description.');
      return false;
    }
    if (formData.latitude === 0 && formData.longitude === 0) {
      setErrorMessage('Please provide valid location coordinates.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Step 3: Severity & People Affected Validation
  const validateStep3 = (): boolean => {
    if (!formData.severity) {
      setErrorMessage('Please select a severity level.');
      return false;
    }
    if (formData.affectedCount < 1) {
      setErrorMessage('Estimated people affected must be at least 1.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Acquire Browser GPS
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsAcquired, setGpsAcquired] = useState<boolean>(false);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setGpsAcquired(true);
        setFormData((prev) => ({
          ...prev,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          address: prev.address || `GPS Location (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
        }));
      },
      (err) => {
        setIsLocating(false);
        setErrorMessage(`Could not obtain GPS: ${err.message}. Please enter address manually.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Image Upload with Client-Side Compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      setCompressionInfo('Compressing photo for low-bandwidth transfer...');
      const result = await compressImage(file, 1280, 1280, 0.7);
      setFormData((prev) => ({
        ...prev,
        mediaUrls: [...(prev.mediaUrls || []), result.dataUrl].slice(0, 5),
      }));
      setCompressionInfo(
        `Optimized! Size reduced by ${result.reductionPercentage}% (${Math.round(result.originalSize / 1024)}KB → ${Math.round(result.compressedSize / 1024)}KB)`
      );
    } catch (err: unknown) {
      setCompressionInfo(null);
      setErrorMessage(`Failed to compress photo: ${(err as Error).message}`);
    }
  };

  // Navigation Handlers
  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 3) {
      setStep4EnteredAt(Date.now());
    }
    setErrorMessage(null);
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setErrorMessage(null);
    setStep((prev) => Math.max(1, prev - 1));
  };

  // Final Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 4) return;
    if (formData.honeypot) {
      // Bot trapped! Silently simulate success
      setSubmissionResult({ trackingCode: 'RL-BOT-CHECK', savedOffline: false });
      setStep(5);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submitReport(formData);
      setSubmissionResult({
        trackingCode: result.trackingCode,
        savedOffline: result.savedOffline,
      });
      await refreshPendingCount();
      setStep(5); // Show success view
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTrackingCode = () => {
    if (!submissionResult) return;
    navigator.clipboard.writeText(submissionResult.trackingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const resetForm = () => {
    setFormData({
      type: 'FLOOD',
      description: '',
      severity: 'HIGH',
      affectedCount: 1,
      vulnerableGroups: [],
      latitude: 25.7617,
      longitude: -80.1918,
      address: '',
      contactPhone: '',
      isAnonymous: false,
      honeypot: '',
      mediaUrls: [],
    });
    setStep(1);
    setSubmissionResult(null);
    setErrorMessage(null);
    setCompressionInfo(null);
  };

  // ==========================================
  // STEP 5: SUCCESS / CONFIRMATION SCREEN
  // ==========================================
  if (step === 5 && submissionResult) {
    return (
      <div className="max-w-2xl mx-auto w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 sm:p-10 shadow-2xl my-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {submissionResult.savedOffline ? t('success.offlineTitle') : t('success.title')}
          </h2>

          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            {submissionResult.savedOffline ? t('success.offlineDesc') : t('success.onlineDesc')}
          </p>

          {/* Tracking Code Banner */}
          <div className="bg-slate-100 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl p-5 my-6 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('success.trackingCode')}
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-black text-blue-700 dark:text-blue-400 select-all tracking-wider">
              {submissionResult.trackingCode}
            </div>
            <button
              onClick={handleCopyTrackingCode}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition touch-target"
            >
              <Copy className="w-4 h-4" />
              <span>{copiedCode ? t('success.copied') : t('success.copy')}</span>
            </button>
          </div>

          {/* What Happens Next Steps */}
          <div className="text-start bg-blue-50 dark:bg-slate-900/50 border border-blue-200 dark:border-slate-700 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              {t('success.whatNext')}
            </h3>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li>{t('success.step1')}</li>
              <li>{t('success.step2')}</li>
              <li>{t('success.step3')}</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link
              href={`/track?code=${encodeURIComponent(submissionResult.trackingCode)}`}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow touch-target"
            >
              <span>{t('success.trackButton')}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={resetForm}
              className="flex-1 inline-flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold py-3.5 px-6 rounded-xl touch-target"
            >
              {t('success.newReport')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // WIZARD STEPS 1 - 4
  // ==========================================
  return (
    <div className="max-w-3xl mx-auto w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden my-4 sm:my-8">
      {/* Offline Alert Banner in Wizard */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>Operating in Offline Mode — Your report will be safely saved locally on this device.</span>
          </div>
        </div>
      )}

      {/* Progress Stepper Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          <span>Step {step} of 4</span>
          <span>
            {step === 1 && 'Incident Type'}
            {step === 2 && 'Location'}
            {step === 3 && 'Urgency & People'}
            {step === 4 && 'Details & Verification'}
          </span>
        </div>
        {/* Progress Bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-red-600 h-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
            role="progressbar"
            aria-valuenow={(step / 4) * 100}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Error Message Box */}
      {errorMessage && (
        <div
          role="alert"
          className="mx-6 mt-6 p-4 bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 rounded-xl text-sm flex items-center gap-3 font-medium"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
        {/* Honeypot field (hidden from real users to catch spam bots) */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website_hp">Leave this empty</label>
          <input
            type="text"
            id="website_hp"
            name="website_hp"
            tabIndex={-1}
            autoComplete="off"
            value={formData.honeypot || ''}
            onChange={(e) => setFormData({ ...formData, honeypot: e.target.value })}
          />
        </div>

        {/* ====================================================
            STEP 1: What Happened? (Incident Type & Description)
            ==================================================== */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('wizard.step1.title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('wizard.step1.desc')}
              </p>
            </div>

            {/* Incident Type Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INCIDENT_TYPES.map((item) => {
                const Icon = item.icon;
                const isSelected = formData.type === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: item.type })}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all touch-target text-center ${
                      isSelected
                        ? 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 font-bold shadow-md ring-2 ring-red-600/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-8 h-8 mb-2 ${isSelected ? 'text-red-600 dark:text-red-400' : item.color}`} />
                    <span className="text-xs sm:text-sm font-semibold leading-tight">
                      {t(item.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Description Textarea */}
            <div className="space-y-2">
              <label
                htmlFor="description"
                className="block text-sm font-bold text-slate-800 dark:text-slate-200"
              >
                {t('form.descriptionLabel')} <span className="text-red-600">*</span>
              </label>
              <textarea
                id="description"
                rows={4}
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('form.descriptionPlaceholder')}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-600 focus:outline-none text-base"
              />
            </div>
          </div>
        )}

        {/* ====================================================
            STEP 2: Where is help needed? (Location & GPS)
            ==================================================== */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('wizard.step2.title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('wizard.step2.desc')}
              </p>
            </div>

            {/* GPS Locate Button */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleUseGps}
                disabled={isLocating}
                className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-2 border-blue-600 text-blue-700 dark:text-blue-300 font-extrabold text-base transition-colors touch-target shadow-sm"
              >
                <LocateFixed className={`w-6 h-6 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'Acquiring GPS...' : t('location.useGps')}</span>
              </button>
              {gpsAcquired && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-bold px-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('location.gpsAcquired')} ({formData.latitude}, {formData.longitude})</span>
                </div>
              )}
            </div>

            {/* Address / Landmark Input */}
            <div className="space-y-2">
              <label htmlFor="address" className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('location.addressLabel')} <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute top-3.5 left-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  id="address"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={t('location.addressPlaceholder')}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-600 focus:outline-none text-base"
                />
              </div>
            </div>

            {/* Latitude and Longitude (Editable if user needs to refine) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="lat" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  id="lat"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="lng" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  id="lng"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            STEP 3: Severity & People Affected
            ==================================================== */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('wizard.step3.title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('wizard.step3.desc')}
              </p>
            </div>

            {/* Severity Radio Group */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                Severity Level
              </label>
              <div className="space-y-2">
                {SEVERITIES.map((s) => {
                  const isSelected = formData.severity === s.level;
                  return (
                    <button
                      key={s.level}
                      type="button"
                      onClick={() => setFormData({ ...formData, severity: s.level })}
                      className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all touch-target text-start ${
                        isSelected
                          ? 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-white font-bold ring-2 ring-red-600/30'
                          : `${s.badgeColor} bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200`
                      }`}
                    >
                      <span className="text-sm font-bold">{t(s.labelKey)}</span>
                      <span className="text-xs uppercase font-extrabold px-2 py-1 rounded bg-slate-200 dark:bg-slate-700">
                        {s.level.replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* People Affected Stepper Counter */}
            <div className="space-y-2 pt-2">
              <label htmlFor="affectedCount" className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('form.affectedLabel')}
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      affectedCount: Math.max(1, prev.affectedCount - 1),
                    }))
                  }
                  className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-black text-xl flex items-center justify-center touch-target"
                >
                  -
                </button>
                <input
                  type="number"
                  id="affectedCount"
                  min={1}
                  value={formData.affectedCount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      affectedCount: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  className="w-24 text-center py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xl font-bold text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      affectedCount: prev.affectedCount + 1,
                    }))
                  }
                  className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-black text-xl flex items-center justify-center touch-target"
                >
                  +
                </button>
              </div>
            </div>

            {/* Vulnerable Groups Checkboxes */}
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('form.vulnerableLabel')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {VULNERABLE_OPTIONS.map((vg) => {
                  const isChecked = formData.vulnerableGroups.includes(vg.id);
                  return (
                    <label
                      key={vg.id}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition touch-target ${
                        isChecked
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-bold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const updated = isChecked
                            ? formData.vulnerableGroups.filter((g) => g !== vg.id)
                            : [...formData.vulnerableGroups, vg.id];
                          setFormData({ ...formData, vulnerableGroups: updated });
                        }}
                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{t(vg.labelKey)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            STEP 4: Photos, Contact & Verification
            ==================================================== */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('wizard.step4.title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('wizard.step4.desc')}
              </p>
            </div>

            {/* Photo Upload with Compression Notice */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('form.photosLabel')}
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 text-center hover:border-slate-400 dark:hover:border-slate-500 transition">
                <input
                  type="file"
                  id="photos"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label
                  htmlFor="photos"
                  className="inline-flex flex-col items-center gap-2 cursor-pointer touch-target"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Take photo or choose file
                  </span>
                  <span className="text-xs text-slate-500">
                    Images are compressed and privacy metadata is stripped.
                  </span>
                </label>
              </div>

              {compressionInfo && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 rounded-xl text-xs font-semibold">
                  {compressionInfo}
                </div>
              )}

              {/* Photo Thumbnails */}
              {formData.mediaUrls && formData.mediaUrls.length > 0 && (
                <div className="flex gap-2 mt-2 overflow-x-auto py-2">
                  {formData.mediaUrls.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 flex-shrink-0">
                      <img src={url} alt={`Upload preview ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Phone (Optional) */}
            <div className="space-y-1">
              <label htmlFor="contactPhone" className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('form.phoneLabel')}
              </label>
              <input
                type="tel"
                id="contactPhone"
                disabled={formData.isAnonymous}
                value={formData.contactPhone || ''}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-600 focus:outline-none text-base disabled:opacity-50"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('form.phoneHint')}
              </p>
            </div>

            {/* Anonymous Toggle */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  {t('form.anonymousLabel')}
                </span>
                <span className="text-xs text-slate-500">
                  {t('form.anonymousHint')}
                </span>
              </div>
              <input
                type="checkbox"
                id="isAnonymous"
                checked={formData.isAnonymous}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    isAnonymous: e.target.checked,
                    contactPhone: e.target.checked ? '' : formData.contactPhone,
                  })
                }
                className="w-6 h-6 text-blue-600 rounded touch-target"
              />
            </div>
          </div>
        )}

        {/* Wizard Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition touch-target"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('form.back')}</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              key={`wizard-btn-next-${step}`}
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow transition touch-target"
            >
              <span>{t('form.next')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              key="wizard-btn-submit"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-black text-base shadow-lg transition touch-target disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('form.submitting')}</span>
                </>
              ) : (
                <span>{t('form.submit')}</span>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
