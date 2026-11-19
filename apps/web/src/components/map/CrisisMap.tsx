'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PublicReportFeedItem, IncidentType } from '../../lib/types';
import { fetchPublicFeed } from '../../lib/api';
import { useI18n } from '../../context/I18nContext';
import {
  Layers,
  Filter,
  AlertTriangle,
  Home,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface ShelterPoint {
  id: string;
  name: string;
  type: 'SHELTER' | 'AID_STATION';
  capacity: string;
  latitude: number;
  longitude: number;
  address: string;
}

const EMERGENCY_SHELTERS: ShelterPoint[] = [
  {
    id: 'sh-1',
    name: 'Red Cross Relief Station #1',
    type: 'SHELTER',
    capacity: '150 beds available',
    latitude: 25.7650,
    longitude: -80.1990,
    address: 'Civic Community Pavilion, Sector A',
  },
  {
    id: 'sh-2',
    name: 'Metropolitan Clean Water & Food Depot',
    type: 'AID_STATION',
    capacity: 'Supplies for 500 families',
    latitude: 25.7580,
    longitude: -80.2050,
    address: 'High School Gymnasium, Distribution Hub',
  },
  {
    id: 'sh-3',
    name: 'Field Medical Triage Center',
    type: 'AID_STATION',
    capacity: 'First aid and emergency prescriptions',
    latitude: 25.7720,
    longitude: -80.1880,
    address: 'Central Sports Complex, West Wing',
  },
];

const FILTER_TYPES: { type: string; labelKey: string }[] = [
  { type: 'ALL', labelKey: 'map.filterAll' },
  { type: 'FLOOD', labelKey: 'type.FLOOD' },
  { type: 'FIRE', labelKey: 'type.FIRE' },
  { type: 'MEDICAL', labelKey: 'type.MEDICAL' },
  { type: 'MISSING_PERSON', labelKey: 'type.MISSING_PERSON' },
  { type: 'FOOD_WATER', labelKey: 'type.FOOD_WATER' },
  { type: 'SHELTER', labelKey: 'type.SHELTER' },
  { type: 'ROAD_BLOCKED', labelKey: 'type.ROAD_BLOCKED' },
];

export function CrisisMap() {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [incidents, setIncidents] = useState<PublicReportFeedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showShelters, setShowShelters] = useState<boolean>(true);

  // Load incidents from API
  const loadData = async (type: string) => {
    setLoading(true);
    try {
      const items = await fetchPublicFeed(type === 'ALL' ? undefined : type);
      setIncidents(items);
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedFilter);
  }, [selectedFilter]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    // Dynamically import Leaflet to ensure window and DOM are present
    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Default center around incident area (e.g. Miami coords from seeds)
        const map = L.map(mapContainerRef.current, {
          center: [25.7617, -80.1918],
          zoom: 12,
          scrollWheelZoom: true,
        });

        // OpenStreetMap raster tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;
        mapInstanceRef.current = map;
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Markers when incidents or filter changes
  useEffect(() => {
    if (typeof window === 'undefined' || !mapInstanceRef.current || !markersLayerRef.current) return;

    import('leaflet').then((L) => {
      const markersLayer = markersLayerRef.current;
      markersLayer.clearLayers();

      // Render Shelters & Aid Points
      if (showShelters) {
        EMERGENCY_SHELTERS.forEach((sh) => {
          const shelterIcon = L.divIcon({
            className: 'custom-shelter-marker',
            html: `<div style="background-color: #059669; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white;">🏠</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const popupContent = `
            <div style="font-family: inherit; font-size: 14px; min-width: 200px;">
              <span style="background: #d1fae5; color: #065f46; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                ${sh.type === 'SHELTER' ? 'Shelter Point' : 'Relief Supply Depot'}
              </span>
              <h4 style="margin: 6px 0 2px 0; font-weight: bold; font-size: 15px;">${sh.name}</h4>
              <p style="margin: 0 0 6px 0; color: #4b5563; font-size: 12px;">${sh.address}</p>
              <div style="background: #f3f4f6; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                Capacity: ${sh.capacity}
              </div>
            </div>
          `;

          L.marker([sh.latitude, sh.longitude], { icon: shelterIcon })
            .bindPopup(popupContent)
            .addTo(markersLayer);
        });
      }

      // Render Incidents
      incidents.forEach((inc) => {
        const isCritical = inc.severity === 'CRITICAL' || inc.severity === 'LIFE_THREATENING';
        const color = isCritical ? '#dc2626' : '#ea580c';

        const incidentIcon = L.divIcon({
          className: 'custom-incident-marker',
          html: `<div style="background-color: ${color}; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 3px 6px rgba(0,0,0,0.35); border: 2px solid white;">⚠️</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const popupContent = `
          <div style="font-family: inherit; font-size: 14px; min-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">
                ${inc.type.replace('_', ' ')}
              </span>
              <span style="font-size: 11px; font-weight: 600; color: #6b7280;">
                ${inc.severity}
              </span>
            </div>
            <h4 style="margin: 0 0 4px 0; font-weight: bold; font-size: 14px; color: #111827;">${inc.address}</h4>
            <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 12px;">
              Estimated affected: <strong>${inc.affectedCount} people</strong>
            </p>
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
              Tracking Code: <span style="font-family: monospace; font-weight: bold; color: #2563eb;">${inc.trackingCode}</span>
            </div>
            <a href="/track?code=${inc.trackingCode}" style="display: block; text-align: center; background: #2563eb; color: white; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;">
              Track Incident Updates &rarr;
            </a>
          </div>
        `;

        L.marker([inc.latitude, inc.longitude], { icon: incidentIcon })
          .bindPopup(popupContent)
          .addTo(markersLayer);
      });
    });
  }, [incidents, showShelters]);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px] w-full relative">
      {/* Top Filter Bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
          <Filter className="w-4 h-4 text-slate-500 flex-shrink-0" />
          {FILTER_TYPES.map((filter) => {
            const isSelected = selectedFilter === filter.type;
            return (
              <button
                key={filter.type}
                onClick={() => setSelectedFilter(filter.type)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors touch-target ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {t(filter.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showShelters}
              onChange={(e) => setShowShelters(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <span>Show Shelters & Aid Points</span>
          </label>

          <button
            onClick={() => loadData(selectedFilter)}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
            title="Refresh feed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 w-full relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Privacy Notice Floating Pill */}
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-lg max-w-md text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-slate-900 dark:text-white">
              Privacy Protection Active
            </span>
            <span>{t('map.legend')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
