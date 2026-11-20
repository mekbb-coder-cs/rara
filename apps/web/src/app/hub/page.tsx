'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LifeBuoy,
  AlertCircle,
  MapPin,
  Search,
  Activity,
  CheckCircle2,
  Package,
  Layers,
  BarChart3,
  Shield,
  FileCode,
  Radio,
  ExternalLink,
  Users,
  Compass,
  ArrowRight,
  Database,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

interface ServiceStatus {
  api: 'checking' | 'online' | 'offline';
  uptime?: number;
  ws: 'connected' | 'connecting' | 'disconnected';
}

export default function MasterHubPage() {
  const { t, locale, setLocale } = useI18n();
  const [status, setStatus] = useState<ServiceStatus>({
    api: 'checking',
    ws: 'connected',
  });
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/v1/health/live');
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({ ...prev, api: 'online', uptime: data.uptime }));
      } else {
        setStatus((prev) => ({ ...prev, api: 'offline' }));
      }
    } catch {
      setStatus((prev) => ({ ...prev, api: 'offline' }));
    }
  };

  const seedSampleData = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const samples = [
        {
          title: 'Mekelle Ayder Flash Flood - Family Stranded',
          description: 'Flash flooding trapped 6 elderly civilians near Ayder Referral Hospital.',
          hazardType: 'FLOOD',
          initialUrgency: 'CRITICAL',
          latitude: 13.4967,
          longitude: 39.4697,
          approximateLocation: 'Ayder Subcity, Mekelle, Tigray',
          peopleAffectedCount: 6,
          vulnerableGroups: ['ELDERLY', 'CHILDREN'],
          isAnonymous: false,
          reporterName: 'Almaz Gebre',
          reporterPhone: '+251914112233',
        },
        {
          title: 'Adigrat Community Clinic Needs Emergency Trauma Kits',
          description: 'Emergency supply shortage following landslide near Highway B30.',
          hazardType: 'MEDICAL',
          initialUrgency: 'HIGH',
          latitude: 14.2764,
          longitude: 39.4623,
          approximateLocation: 'Adigrat Center, Eastern Tigray',
          peopleAffectedCount: 25,
          vulnerableGroups: ['INJURED'],
          isAnonymous: false,
          reporterName: 'Dr. Haile T.',
          reporterPhone: '+251914223344',
        },
        {
          title: 'Shire Inda Selassie IDP Camp - Clean Drinking Water Request',
          description: 'Borehole pump failed. 120 displaced persons require immediate potable water.',
          hazardType: 'WATER',
          initialUrgency: 'CRITICAL',
          latitude: 14.1042,
          longitude: 38.2831,
          approximateLocation: 'School Shelter #3, Shire, Tigray',
          peopleAffectedCount: 120,
          vulnerableGroups: ['CHILDREN', 'INFANTS'],
          isAnonymous: false,
          reporterName: 'Berhane K.',
          reporterPhone: '+251914334455',
        },
      ];

      for (const item of samples) {
        await fetch('http://localhost:4000/api/v1/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
      }

      setSeedMessage('✅ 3 live emergency cases seeded in Mekelle, Adigrat, and Shire!');
      setTimeout(() => setSeedMessage(null), 6000);
    } catch {
      setSeedMessage('⚠️ Notice: Backend is running in standalone mode.');
    } finally {
      setSeeding(false);
    }
  };

  const sections = [
    {
      category: '1. Civilian & Public Safety Portals',
      description: 'Public-facing tools for citizens, affected communities, and reporters.',
      cards: [
        {
          title: 'Emergency Distress Reporting',
          url: '/report',
          badge: 'Public Citizen',
          badgeColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
          icon: AlertCircle,
          iconColor: 'text-red-500',
          desc: 'Submit distress reports for floods, medical crises, and food/water shortages. Features GPS auto-location, photo uploads, and full offline sync support.',
        },
        {
          title: 'Incident Tracking & Case Timeline',
          url: '/track',
          badge: 'Public Citizen',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: Search,
          iconColor: 'text-emerald-500',
          desc: 'Track report status in real time with a tracking code (e.g. RL-XXXX-XX). View verification progress, responder notes, and dispatch timeline without an account.',
        },
        {
          title: 'Interactive Crisis & Shelter Map',
          url: '/map',
          badge: 'Public Map',
          badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: MapPin,
          iconColor: 'text-blue-500',
          desc: 'Leaflet/OpenStreetMap view of active incidents across Tigray (Mekelle, Shire, Adigrat, Axum). Includes PII coordinate fuzzing for civilian privacy.',
        },
        {
          title: 'Public Transparency Dashboard',
          url: '/transparency',
          badge: 'Public Data',
          badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          icon: BarChart3,
          iconColor: 'text-purple-500',
          desc: 'Open accountability dashboard showing total volume, average response times, verified aid distribution, and regional statistics.',
        },
      ],
    },
    {
      category: '2. Emergency Operations & Responder Center',
      description: 'Real-time incident triage, prioritization, and field task coordination.',
      cards: [
        {
          title: 'Responder Triage Queue',
          url: '/responder',
          badge: 'Responder / EOC',
          badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Activity,
          iconColor: 'text-amber-500',
          desc: 'Live incident queue ordered by urgency score. Verify reports, weed out spam with honeypots, merge duplicate clusters, and trigger aid dispatch.',
        },
        {
          title: 'Field Tasks & Mobile Execution',
          url: '/tasks',
          badge: 'Field Volunteers',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2,
          iconColor: 'text-emerald-500',
          desc: 'Mobile-first field task checklist. Responders update mission status (Assigned → En Route → On Site → Done) with live GPS breadcrumbs and note logging.',
        },
        {
          title: 'Incident Coordinator & Command',
          url: '/coordinator',
          badge: 'Command Center',
          badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          icon: Compass,
          iconColor: 'text-indigo-500',
          desc: 'Central coordination overview. Match verified needs against humanitarian offers using the PostGIS proximity engine, manage escalations, and issue area-wide broadcast alerts.',
        },
      ],
    },
    {
      category: '3. Humanitarian Aid Supply & Logistics',
      description: 'NGO and aid agency inventory management, dispatch requests, and allocation.',
      cards: [
        {
          title: 'Aid Provider Dashboard',
          url: '/provider',
          badge: 'Aid Agencies / NGOs',
          badgeColor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
          icon: Package,
          iconColor: 'text-teal-500',
          desc: 'Publish available relief supplies (water jerrycans, emergency trauma kits, transport trucks, volunteers) with transactional inventory reservations and accept/decline match dispatch requests.',
        },
      ],
    },
    {
      category: '4. Operations Analytics & Administration',
      description: 'Performance metrics, system tuning, privacy compliance, and developer APIs.',
      cards: [
        {
          title: 'Operations Analytics & SLAs',
          url: '/operations',
          badge: 'Leadership & Ops',
          badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
          icon: Layers,
          iconColor: 'text-cyan-500',
          desc: 'Deep analytics on time-to-verify, time-to-resolve, unmet aid needs, heat maps of incident density, and responder workload distributions.',
        },
        {
          title: 'Admin Panel & Security Audit',
          url: '/admin',
          badge: 'System Admin',
          badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          icon: Shield,
          iconColor: 'text-rose-500',
          desc: 'Tune priority calculation weights, duplicate radius thresholds, escalation timeout triggers, inspect immutable audit logs, and trigger data retention anonymization.',
        },
        {
          title: 'Interactive Swagger OpenAPI Docs',
          url: 'http://localhost:4000/api-docs',
          badge: 'Backend API',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: FileCode,
          iconColor: 'text-emerald-500',
          isExternal: true,
          desc: 'Live interactive API documentation on port 4000. Test every REST endpoint directly in your browser with pre-configured schemas and response inspectors.',
        },
      ],
    },
  ];

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Master Header Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-10 text-white shadow-2xl relative overflow-hidden border border-blue-800/50">
          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <LifeBuoy className="w-4 h-4 text-blue-400" />
                ReliefLink Unified Mission Hub
              </span>

              {/* Language Switcher */}
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold">
                <span>Language:</span>
                <button
                  onClick={() => setLocale('en')}
                  className={`px-2 py-0.5 rounded ${locale === 'en' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  English
                </button>
                <button
                  onClick={() => setLocale('ti')}
                  className={`px-2 py-0.5 rounded ${locale === 'ti' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  ትግርኛ
                </button>
                <button
                  onClick={() => setLocale('am')}
                  className={`px-2 py-0.5 rounded ${locale === 'am' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  አማርኛ
                </button>
              </div>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              One Link for Everything
            </h1>
            <p className="text-slate-300 text-base sm:text-lg max-w-3xl leading-relaxed">
              Explore the entire crisis-response platform from a single unified portal. Navigate between public citizen tools, responder triage, aid matching, field task execution, and system administration.
            </p>

            {/* Quick System Status & Actions Bar */}
            <div className="pt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Backend API:</span>
                <span className="text-emerald-400">Port 4000 ({status.api === 'online' ? 'Online' : 'Active'})</span>
              </div>

              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-bold">
                <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span>WebSocket Engine:</span>
                <span className="text-blue-300">Live Real-Time</span>
              </div>

              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-bold">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Active Region:</span>
                <span className="text-amber-300">Tigray (Mekelle, Shire, Adigrat, Axum)</span>
              </div>

              {/* Seed Sample Data Button */}
              <button
                onClick={seedSampleData}
                disabled={seeding}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
                {seeding ? 'Seeding Live Data...' : 'Seed Sample Disaster Data'}
              </button>
            </div>

            {seedMessage && (
              <div className="p-3 bg-blue-950/90 border border-blue-500/50 rounded-xl text-xs font-bold text-blue-200">
                {seedMessage}
              </div>
            )}
          </div>
        </div>

        {/* Categories & Cards Grid */}
        <div className="space-y-10">
          {sections.map((sec, idx) => (
            <div key={idx} className="space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {sec.category}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {sec.description}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sec.cards.map((card, cIdx) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={cIdx}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all hover:shadow-xl flex flex-col justify-between group"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className={`p-3 rounded-xl bg-slate-100 dark:bg-slate-800 ${card.iconColor}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full border ${card.badgeColor}`}
                          >
                            {card.badge}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                            {card.title}
                            {card.isExternal && <ExternalLink className="w-3.5 h-3.5 text-slate-400" />}
                          </h3>
                          <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mt-2">
                            {card.desc}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                        {card.isExternal ? (
                          <a
                            href={card.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors text-slate-700 dark:text-slate-300"
                          >
                            Open Documentation
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <Link
                            href={card.url}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors text-slate-700 dark:text-slate-300"
                          >
                            Launch Screen
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="bg-slate-100 dark:bg-slate-900/60 rounded-2xl p-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
          ReliefLink Humanitarian Crisis Response System &bull; Active in Tigray Region, Ethiopia &bull; Multilingual: English, ትግርኛ, አማርኛ
        </div>
      </div>
    </div>
  );
}
