'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  MapPin,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import * as api from '../../lib/api';
import { AidOfferItem, MatchRecordItem, AidType } from '../../lib/types';

export default function ProviderDashboardPage() {
  const [activeTab, setActiveTab] = useState<'requests' | 'offers' | 'history'>('requests');
  const [incomingMatches, setIncomingMatches] = useState<MatchRecordItem[]>([]);
  const [offers, setOffers] = useState<AidOfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal: Publish Offer
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [newAidType, setNewAidType] = useState<AidType>('FOOD_WATER');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCapacity, setNewCapacity] = useState(100);
  const [newUnit, setNewUnit] = useState('20L water jerrycans');
  const [newRadius, setNewRadius] = useState(30);
  const [newLat, setNewLat] = useState(13.4967);
  const [newLng, setNewLng] = useState(39.4753);

  // Modal: Decline Match
  const [declineMatchId, setDeclineMatchId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  // Modal: Partial Fulfill
  const [partialMatchId, setPartialMatchId] = useState<string | null>(null);
  const [partialQuantity, setPartialQuantity] = useState<number>(1);
  const [maxPartialQuantity, setMaxPartialQuantity] = useState<number>(1);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [matchesRes, offersRes] = await Promise.all([
        api.listProviderMatches(),
        api.listAidOffers(),
      ]);

      // If hermetic / empty, provide realistic Tigray aid data for immediate demonstration
      const initialMatches =
        matchesRes.length > 0
          ? matchesRes
          : [
              {
                id: 'match-demo-1',
                needId: 'need-demo-1',
                offerId: 'offer-demo-1',
                organizationId: 'org-red-cross-tigray',
                matchedQuantity: 40,
                compatibilityScore: 94.5,
                distanceMeters: 4200,
                estimatedTravelMins: 22,
                status: 'PENDING_PROVIDER' as const,
                timeoutAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
                proposedAt: new Date().toISOString(),
                scoreBreakdown: {
                  typeFitScore: 30,
                  distanceScore: 23,
                  capacityScore: 20,
                  reliabilityScore: 14.5,
                  urgencyMultiplier: 1.2,
                  estimatedDistanceKm: 4.2,
                  estimatedTravelMinutes: 22,
                  compositeScore: 94.5,
                  reasons: [
                    'Exact type match: FOOD_WATER',
                    'Within 4.2 km of Suhul Shire Camp',
                    '100% capacity available',
                  ],
                },
                need: {
                  id: 'need-demo-1',
                  reportId: 'rep-demo-1',
                  reportTitle: 'Shire Suhul Displacement Center Flood',
                  reportTrackingCode: 'RL-9921-SH',
                  aidType: 'FOOD_WATER' as const,
                  quantityRequired: 40,
                  quantityFulfilled: 0,
                  unit: '20L water jerrycans',
                  urgency: 'URGENT' as const,
                  status: 'MATCH_PROPOSED' as const,
                  latitude: 14.1032,
                  longitude: 38.2865,
                  isEscalated: false,
                  createdAt: new Date().toISOString(),
                },
              },
            ];

      const initialOffers =
        offersRes.length > 0
          ? offersRes
          : [
              {
                id: 'offer-demo-1',
                organizationId: 'org-red-cross-tigray',
                organizationName: 'Ethiopian Red Cross Society - Tigray Branch',
                aidType: 'FOOD_WATER' as const,
                title: 'Clean Drinking Water Storage Depot - Shire',
                description: 'Purified water drums ready for humanitarian dispatch.',
                capacityTotal: 150,
                capacityRemaining: 110,
                capacityReserved: 40,
                capacityFulfilled: 0,
                unit: '20L water jerrycans',
                status: 'AVAILABLE' as const,
                latitude: 14.105,
                longitude: 38.288,
                serviceRadiusKm: 35,
                availableFrom: new Date().toISOString(),
                version: 2,
                createdAt: new Date().toISOString(),
              },
              {
                id: 'offer-demo-2',
                organizationId: 'org-red-cross-tigray',
                organizationName: 'Ethiopian Red Cross Society - Tigray Branch',
                aidType: 'MEDICAL_SUPPLIES' as const,
                title: 'Trauma & Wound Care Field Kits - Mekelle',
                description: 'Emergency medical supplies for field clinics.',
                capacityTotal: 80,
                capacityRemaining: 55,
                capacityReserved: 0,
                capacityFulfilled: 25,
                unit: 'first aid trauma kits',
                status: 'AVAILABLE' as const,
                latitude: 13.498,
                longitude: 39.477,
                serviceRadiusKm: 50,
                availableFrom: new Date().toISOString(),
                version: 4,
                createdAt: new Date().toISOString(),
              },
            ];

      setIncomingMatches(initialMatches);
      setOffers(initialOffers);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to load provider dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(match: MatchRecordItem) {
    setErrorMessage(null);
    try {
      await api.providerRespondToMatch(match.id, { action: 'ACCEPT' });
      setActionNotice(
        `Match accepted! ${match.matchedQuantity} ${match.need?.unit || 'units'} dispatched to ${match.need?.reportTitle || 'incident site'}.`
      );
      // Update local state
      setIncomingMatches((prev) =>
        prev.map((m) =>
          m.id === match.id ? { ...m, status: 'ACCEPTED_BY_PROVIDER' as const } : m
        )
      );
      // Update offer stock
      setOffers((prev) =>
        prev.map((o) =>
          o.id === match.offerId
            ? {
                ...o,
                capacityReserved: Math.max(0, o.capacityReserved - match.matchedQuantity),
                capacityFulfilled: o.capacityFulfilled + match.matchedQuantity,
              }
            : o
        )
      );
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to accept match');
    }
  }

  async function handleConfirmDecline() {
    if (!declineMatchId || !declineReason.trim()) return;
    setErrorMessage(null);
    try {
      await api.providerRespondToMatch(declineMatchId, {
        action: 'DECLINE',
        declineReason,
      });

      const matched = incomingMatches.find((m) => m.id === declineMatchId);
      setActionNotice('Match declined. Reserved stock restored to available inventory.');
      setIncomingMatches((prev) =>
        prev.map((m) =>
          m.id === declineMatchId ? { ...m, status: 'DECLINED_BY_PROVIDER' as const } : m
        )
      );
      if (matched) {
        setOffers((prev) =>
          prev.map((o) =>
            o.id === matched.offerId
              ? {
                  ...o,
                  capacityReserved: Math.max(0, o.capacityReserved - matched.matchedQuantity),
                  capacityRemaining: o.capacityRemaining + matched.matchedQuantity,
                }
              : o
          )
        );
      }
      setDeclineMatchId(null);
      setDeclineReason('');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to decline match');
    }
  }

  async function handleConfirmPartial() {
    if (!partialMatchId || partialQuantity <= 0) return;
    setErrorMessage(null);
    try {
      await api.providerRespondToMatch(partialMatchId, {
        action: 'PARTIAL',
        partiallyFulfilledQuantity: partialQuantity,
      });

      const matched = incomingMatches.find((m) => m.id === partialMatchId);
      setActionNotice(
        `Partially fulfilled with ${partialQuantity} units. Unfulfilled remainder restored to available stock.`
      );
      setIncomingMatches((prev) =>
        prev.map((m) =>
          m.id === partialMatchId
            ? {
                ...m,
                status: 'ACCEPTED_BY_PROVIDER' as const,
                partiallyFulfilledQuantity: partialQuantity,
              }
            : m
        )
      );
      if (matched) {
        const remainder = matched.matchedQuantity - partialQuantity;
        setOffers((prev) =>
          prev.map((o) =>
            o.id === matched.offerId
              ? {
                  ...o,
                  capacityReserved: Math.max(0, o.capacityReserved - matched.matchedQuantity),
                  capacityFulfilled: o.capacityFulfilled + partialQuantity,
                  capacityRemaining: o.capacityRemaining + remainder,
                }
              : o
          )
        );
      }
      setPartialMatchId(null);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to partially fulfill match');
    }
  }

  async function handlePublishOffer(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const created = await api.createAidOffer({
        aidType: newAidType,
        title: newTitle,
        description: newDescription,
        capacityTotal: newCapacity,
        unit: newUnit,
        latitude: newLat,
        longitude: newLng,
        serviceRadiusKm: newRadius,
      });

      setActionNotice(`Aid offer "${newTitle}" published successfully!`);
      setOffers((prev) => [created, ...prev]);
      setIsPublishModalOpen(false);
      setNewTitle('');
      setNewDescription('');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to publish aid offer');
    }
  }

  const pendingRequests = incomingMatches.filter(
    (m) => m.status === 'PENDING_PROVIDER' || m.status === 'PROPOSED'
  );
  const matchHistory = incomingMatches.filter(
    (m) => m.status !== 'PENDING_PROVIDER' && m.status !== 'PROPOSED'
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-6 h-6" />
              </span>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  Approved Humanitarian Provider
                </span>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                  Ethiopian Red Cross Society - Tigray Branch
                </h1>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jurisdiction: Tigray Region (Mekelle, Shire, Adigrat, Axum) • Registration: ET-NGO-9921
            </p>
          </div>

          {/* Reliability Score Card */}
          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-8">
            <div className="text-right">
              <div className="text-xs font-bold text-slate-500 uppercase">
                Reliability Rating
              </div>
              <div className="text-3xl font-black text-emerald-600 flex items-center justify-end gap-1">
                <TrendingUp className="w-6 h-6" />
                96%
              </div>
              <div className="text-[11px] text-slate-400">Based on 28 completed dispatches</div>
            </div>

            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl shadow-sm transition flex items-center gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Publish Offer</span>
            </button>
          </div>
        </div>

        {/* Action Alerts */}
        {actionNotice && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-bold flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-emerald-700 font-black">
              ✕
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 text-sm font-bold flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-700 font-black">
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`pb-4 px-2 font-extrabold text-sm flex items-center gap-2 border-b-2 transition ${
              activeTab === 'requests'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Incoming Match Requests</span>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-xs font-black">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('offers')}
            className={`pb-4 px-2 font-extrabold text-sm flex items-center gap-2 border-b-2 transition ${
              activeTab === 'offers'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Published Aid Inventory ({offers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-4 px-2 font-extrabold text-sm flex items-center gap-2 border-b-2 transition ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Fulfillment History ({matchHistory.length})</span>
          </button>
        </div>

        {/* Tab 1: Incoming Match Requests */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {pendingRequests.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  No Pending Match Requests
                </h3>
                <p className="text-xs text-slate-500">
                  New emergency aid matches will appear here in real-time as responders triage cases.
                </p>
              </div>
            ) : (
              pendingRequests.map((match) => (
                <div
                  key={match.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-6 border-2 border-blue-500/30 shadow-md space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs font-black">
                          {match.need?.urgency || 'URGENT'}
                        </span>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">
                          {match.need?.reportTitle || 'Emergency Incident Need'}
                        </h3>
                        <span className="text-xs font-mono text-slate-400">
                          {match.need?.reportTrackingCode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                          ~{match.scoreBreakdown?.estimatedDistanceKm || '3.5'} km away
                        </span>
                        <span>•</span>
                        <span>Estimated travel: {match.estimatedTravelMins || 20} mins</span>
                        <span>•</span>
                        <span className="text-blue-600 font-bold">
                          Match Score: {match.compatibilityScore}%
                        </span>
                      </div>
                    </div>

                    {/* Timer Badge */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-black">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Response Window: ~45 mins left</span>
                    </div>
                  </div>

                  {/* Allocation Details */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-4 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-xs text-slate-500 uppercase font-bold">
                        Requested Quantity
                      </span>
                      <div className="text-xl font-black text-slate-900 dark:text-white">
                        {match.matchedQuantity} {match.need?.unit || 'units'}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 uppercase font-bold">
                        Stock Reserved
                      </span>
                      <div className="text-sm font-extrabold text-amber-600">
                        {match.matchedQuantity} units reserved on your depot
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 uppercase font-bold">Category</span>
                      <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                        {match.need?.aidType || 'FOOD_WATER'}
                      </div>
                    </div>
                  </div>

                  {/* Response Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeclineMatchId(match.id);
                        setDeclineReason('');
                      }}
                      className="px-5 py-2.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Decline Request</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPartialMatchId(match.id);
                        setMaxPartialQuantity(match.matchedQuantity);
                        setPartialQuantity(Math.floor(match.matchedQuantity / 2));
                      }}
                      className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition"
                    >
                      Partially Fulfill...
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccept(match)}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept & Dispatch Full Quantity</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Published Offers & Inventory */}
        {activeTab === 'offers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {offers.map((offer) => {
              const availablePct = Math.round((offer.capacityRemaining / offer.capacityTotal) * 100);
              const reservedPct = Math.round((offer.capacityReserved / offer.capacityTotal) * 100);
              const fulfilledPct = Math.round((offer.capacityFulfilled / offer.capacityTotal) * 100);

              return (
                <div
                  key={offer.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-black uppercase text-blue-600">
                        {offer.aidType}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">
                        {offer.title}
                      </h3>
                      {offer.description && (
                        <p className="text-xs text-slate-500 mt-1">{offer.description}</p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black ${
                        offer.status === 'AVAILABLE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {offer.status}
                    </span>
                  </div>

                  {/* Stock Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-400">Inventory Allocation</span>
                      <span className="text-slate-900 dark:text-white">
                        {offer.capacityRemaining} / {offer.capacityTotal} {offer.unit} available
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${fulfilledPct}%` }}
                        className="bg-emerald-600 h-full"
                        title={`Fulfilled: ${offer.capacityFulfilled}`}
                      />
                      <div
                        style={{ width: `${reservedPct}%` }}
                        className="bg-amber-500 h-full"
                        title={`Reserved: ${offer.capacityReserved}`}
                      />
                      <div
                        style={{ width: `${availablePct}%` }}
                        className="bg-blue-600 h-full"
                        title={`Available: ${offer.capacityRemaining}`}
                      />
                    </div>
                    <div className="flex gap-4 text-[11px] font-semibold text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        Available ({offer.capacityRemaining})
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Reserved ({offer.capacityReserved})
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        Fulfilled ({offer.capacityFulfilled})
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>Service Radius: {offer.serviceRadiusKm} km</span>
                    <span>Version #{offer.version}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Fulfillment History */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Dispatch & Fulfillment History
            </h3>
            {matchHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No previous completed matches recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {matchHistory.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-white">
                        {m.need?.reportTitle || 'Emergency Case'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Allocated: {m.partiallyFulfilledQuantity || m.matchedQuantity}{' '}
                        {m.need?.unit || 'units'}
                        {m.declineReason && ` • Reason: ${m.declineReason}`}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black ${
                        m.status === 'ACCEPTED_BY_PROVIDER'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Publish Aid Offer */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handlePublishOffer}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800"
          >
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-blue-600" />
              Publish Humanitarian Aid Offer
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Resource Title
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Clean Drinking Water Tank Supply"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Aid Category
                </label>
                <select
                  value={newAidType}
                  onChange={(e) => setNewAidType(e.target.value as AidType)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="FOOD_WATER">Food & Water</option>
                  <option value="MEDICAL_SUPPLIES">Medical Supplies</option>
                  <option value="SHELTER_BEDDING">Shelter & Beds</option>
                  <option value="SEARCH_AND_RESCUE">Search & Rescue</option>
                  <option value="EVACUATION_TRANSPORT">Transport</option>
                  <option value="EQUIPMENT_TOOLS">Equipment</option>
                  <option value="HYGIENE_KIT">Hygiene Kits</option>
                  <option value="PERSONNEL_VOLUNTEER">Volunteers</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Total Capacity
                </label>
                <input
                  type="number"
                  min="1"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Unit (e.g. liters, boxes, beds)
                </label>
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Service Radius (km)
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={newRadius}
                  onChange={(e) => setNewRadius(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
              >
                Publish Offer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Decline Request with Mandatory Reason */}
      {declineMatchId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              Decline Match Request
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Declining will restore reserved inventory and allow the matching engine to immediately
              re-route this incident to another aid provider. A mandatory reason is required.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Declining
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g., Road cut off due to landslides; vehicles dispatched to separate flood rescue..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeclineMatchId(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecline}
                disabled={!declineReason.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Partial Fulfillment */}
      {partialMatchId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-blue-600" />
              Partially Fulfill Match Request
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Specify the exact quantity your organization can immediately commit. The remaining
              unfulfilled portion will be returned to the open need pool for secondary matching.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Fulfilled Quantity (Max: {maxPartialQuantity})
              </label>
              <input
                type="number"
                min="1"
                max={maxPartialQuantity}
                value={partialQuantity}
                onChange={(e) => setPartialQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPartialMatchId(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPartial}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
              >
                Commit Partial Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
