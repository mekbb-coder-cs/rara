'use client';

import React, { useState, useEffect } from 'react';
import {
  AidType,
  NeedUrgency,
  AidNeedItem,
  MatchCandidateItem,
} from '../../lib/types';
import * as api from '../../lib/api';
import {
  PackagePlus,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  ShieldCheck,
  ChevronRight,
  Send,
  HelpCircle,
} from 'lucide-react';

interface MatchingPanelProps {
  reportId: string;
  reportTitle: string;
  reportTrackingCode: string;
  reportLatitude: number;
  reportLongitude: number;
  onMatchConfirmed?: () => void;
}

export function MatchingPanel({
  reportId,
  reportTitle,
  reportTrackingCode,
  reportLatitude,
  reportLongitude,
  onMatchConfirmed,
}: MatchingPanelProps) {
  const [needs, setNeeds] = useState<AidNeedItem[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<AidNeedItem | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidateItem[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [noMatchFound, setNoMatchFound] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state for creating a new need
  const [isCreatingNeed, setIsCreatingNeed] = useState(false);
  const [aidType, setAidType] = useState<AidType>('FOOD_WATER');
  const [quantity, setQuantity] = useState<number>(50);
  const [unit, setUnit] = useState<string>('liters / boxes');
  const [urgency, setUrgency] = useState<NeedUrgency>('URGENT');
  const [notes, setNotes] = useState<string>('');

  // Escalation modal state
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');

  // Load existing needs for this report
  useEffect(() => {
    loadNeeds();
  }, [reportId]);

  async function loadNeeds() {
    try {
      const res = await api.listAidNeeds({ reportId });
      const items = Array.isArray(res) ? res : (res as any)?.data || (res as any)?.needs || [];
      setNeeds(items);
      if (items.length > 0 && !selectedNeed) {
        selectNeed(items[0]);
      }
    } catch {
      // Hermetic fallback
    }
  }

  async function selectNeed(need: AidNeedItem) {
    setSelectedNeed(need);
    setLoadingCandidates(true);
    setErrorMessage(null);
    try {
      const data = await api.getCandidateMatches(need.id);
      setCandidates(data.candidates || []);
      setNoMatchFound(data.noMatchFound);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to fetch match candidates');
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleCreateNeed(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const newNeed = await api.createAidNeed({
        reportId,
        aidType,
        quantityRequired: quantity,
        unit,
        urgency,
        notes,
      });
      setIsCreatingNeed(false);
      setActionMessage('Aid need registered. Calculating candidate matches...');
      await loadNeeds();
      selectNeed(newNeed);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to create aid need');
    }
  }

  async function handleConfirmMatch(candidate: MatchCandidateItem) {
    if (!selectedNeed) return;
    setErrorMessage(null);
    try {
      await api.confirmMatch({
        needId: selectedNeed.id,
        offerId: candidate.offerId,
        requestedQuantity: selectedNeed.quantityRequired,
        timeoutMinutes: 60,
      });

      setActionMessage(
        `Match confirmed! Stock reserved on ${candidate.organizationName}. Match request dispatched to provider.`
      );
      if (onMatchConfirmed) onMatchConfirmed();
      selectNeed(selectedNeed);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to confirm match');
    }
  }

  async function handleEscalateNeed() {
    if (!selectedNeed || !escalationReason) return;
    try {
      await api.escalateNeed(selectedNeed.id, escalationReason);
      setIsEscalating(false);
      setActionMessage('Need successfully escalated to emergency coordinators.');
      loadNeeds();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to escalate need');
    }
  }

  return (
    <div className="space-y-6">
      {actionMessage && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm font-semibold flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-green-600 dark:text-green-400 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 dark:text-red-400 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Add Need Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-blue-600" />
            Humanitarian Aid Needs & Matching
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Structure verified incident needs to discover and rank approved aid supply offers.
          </p>
        </div>
        {!isCreatingNeed && (
          <button
            type="button"
            onClick={() => setIsCreatingNeed(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            + Add Aid Need
          </button>
        )}
      </div>

      {/* Create Need Form */}
      {isCreatingNeed && (
        <form
          onSubmit={handleCreateNeed}
          className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div className="font-bold text-sm text-slate-900 dark:text-white">
            Structure New Aid Need
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Resource Category
              </label>
              <select
                value={aidType}
                onChange={(e) => setAidType(e.target.value as AidType)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="FOOD_WATER">Food & Clean Water</option>
                <option value="MEDICAL_SUPPLIES">Medical Supplies / Trauma Kits</option>
                <option value="SHELTER_BEDDING">Shelter / Bedding / Tents</option>
                <option value="SEARCH_AND_RESCUE">Search & Rescue Boat / Gear</option>
                <option value="EVACUATION_TRANSPORT">Evacuation Transport / Vehicles</option>
                <option value="EQUIPMENT_TOOLS">Equipment & Heavy Tools</option>
                <option value="HYGIENE_KIT">Hygiene Kits</option>
                <option value="PERSONNEL_VOLUNTEER">Medical / Translator Volunteers</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Urgency Level
              </label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as NeedUrgency)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="IMMEDIATE">Immediate (Critical Life Threat)</option>
                <option value="URGENT">Urgent (Within Hours)</option>
                <option value="STANDARD">Standard (Within 24 Hours)</option>
                <option value="FLEXIBLE">Flexible (Scheduled Aid)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Quantity Required
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Unit of Measure
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. jerrycans, beds, boxes, medics"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Logistics & Delivery Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Deliver to school compound gate, accessible via south gravel road..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreatingNeed(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow"
            >
              Save & Find Matches
            </button>
          </div>
        </form>
      )}

      {/* Existing Needs List */}
      {needs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {needs.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => selectNeed(n)}
              className={`px-4 py-2.5 rounded-xl text-left border transition whitespace-nowrap ${
                selectedNeed?.id === n.id
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <span>{n.aidType}</span>
                {n.isEscalated && (
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-black">
                    ESCALATED
                  </span>
                )}
                {n.status === 'FULFILLED' && (
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-black">
                    FULFILLED
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {n.quantityRequired} {n.unit} ({n.urgency})
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Candidate Matches Section */}
      {selectedNeed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              Ranked Candidate Offers for {selectedNeed.quantityRequired} {selectedNeed.unit} (
              {selectedNeed.aidType})
            </h4>
            <button
              type="button"
              onClick={() => setIsEscalating(true)}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Escalate to Coordinator
            </button>
          </div>

          {loadingCandidates ? (
            <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
              Computing candidate matches with PostGIS distance & provider reliability...
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
              <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
                No Compatible Aid Offers Found in Vicinity
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
                No active aid offers matching {selectedNeed.aidType} have available capacity within
                service radius. Escalate this case to emergency coordinators to mobilize external aid.
              </p>
              <button
                type="button"
                onClick={() => setIsEscalating(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow"
              >
                Escalate to Regional Coordinator Now
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((cand, idx) => (
                <div
                  key={cand.offerId}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-400 transition space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          #{idx + 1} {cand.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-black ${
                            cand.compatibilityScore >= 80
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {cand.compatibilityScore}% Match
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          {cand.organizationName}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {cand.distanceKm.toFixed(1)} km away (~{cand.estimatedTravelMinutes} mins)
                        </span>
                        <span>•</span>
                        <span className="font-bold text-emerald-600">
                          {cand.capacityAvailable} {cand.unit} in stock
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmMatch(cand)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center gap-1.5 touch-target"
                    >
                      <span>Confirm Match</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Score Breakdown Pills */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl space-y-2 text-xs">
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">
                        Type: {cand.scoreBreakdown.typeFitScore}/30
                      </span>
                      <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                        Distance: {cand.scoreBreakdown.distanceScore}/25
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">
                        Capacity: {cand.scoreBreakdown.capacityScore}/20
                      </span>
                      <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                        Reliability: {cand.scoreBreakdown.reliabilityScore}/15
                      </span>
                      <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded">
                        Urgency x{cand.scoreBreakdown.urgencyMultiplier}
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                      {cand.scoreBreakdown.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Escalation Modal */}
      {isEscalating && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Escalate Need to Emergency Coordinator
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Coordinators manage regional resource allocation and inter-agency mobilization when local
              stock is depleted or unavailable.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Escalation Justification
              </label>
              <textarea
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="e.g. Local water supply depots exhausted. Need regional tank supply delivery from Mekelle."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEscalating(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEscalateNeed}
                disabled={!escalationReason}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow"
              >
                Confirm Escalation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
