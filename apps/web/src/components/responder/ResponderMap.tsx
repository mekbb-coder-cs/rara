'use client';

import React, { useEffect, useRef } from 'react';
import { TriageReportItem } from '../../lib/types';
import { Flame, Layers, MapPin } from 'lucide-react';

interface ResponderMapProps {
  reports: TriageReportItem[];
  selectedReportId: string | null;
  onSelectReport: (report: TriageReportItem) => void;
}

export function ResponderMap({
  reports,
  selectedReportId,
  onSelectReport,
}: ResponderMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Center around Tigray Region, Ethiopia (Mekelle: 13.4967, 39.4753)
        const map = L.map(mapContainerRef.current, {
          center: [13.4967, 39.4753],
          zoom: 8,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;
        mapInstanceRef.current = map;
      }

      // Re-render markers on reports change
      if (markersLayerRef.current) {
        markersLayerRef.current.clearLayers();

        reports.forEach((item) => {
          const score = item.priorityScore ?? 0;
          let markerColor = '#10B981'; // Green
          if (score >= 80) markerColor = '#EF4444'; // Red
          else if (score >= 60) markerColor = '#F97316'; // Orange
          else if (score >= 40) markerColor = '#F59E0B'; // Amber

          const isSelected = selectedReportId === item.id;
          const radius = isSelected ? 12 : 9;

          const circle = L.circleMarker([item.latitude, item.longitude], {
            radius,
            fillColor: markerColor,
            color: isSelected ? '#FFFFFF' : '#0F172A',
            weight: isSelected ? 3 : 2,
            opacity: 1,
            fillOpacity: 0.9,
          });

          circle.on('click', () => {
            onSelectReport(item);
          });

          // Tooltip showing tracking code, score, and title
          circle.bindTooltip(
            `<div style="font-family: sans-serif; font-size: 11px;">
              <strong>${item.trackingCode}</strong> (P${score.toFixed(1)})<br/>
              <span>${item.title}</span><br/>
              <span style="color: #94A3B8;">${item.peopleAffectedCount} affected • ${item.status}</span>
            </div>`,
            { direction: 'top', offset: [0, -8] }
          );

          circle.addTo(markersLayerRef.current);
        });

        // Fit map bounds if reports exist
        if (reports.length > 0 && mapInstanceRef.current) {
          const group = L.featureGroup(
            reports.map((r) => L.marker([r.latitude, r.longitude]))
          );
          mapInstanceRef.current.fitBounds(group.getBounds().pad(0.15));
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [reports, selectedReportId, onSelectReport]);

  return (
    <div className="relative w-full h-full min-h-[300px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-2.5 text-xs text-slate-200 shadow-lg space-y-1.5 pointer-events-auto">
        <div className="font-bold text-[11px] uppercase tracking-wider text-slate-400">
          Priority Map Legend
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 border border-white/50" />
          <span>Critical P80+</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 border border-white/50" />
          <span>High P60 - 79</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white/50" />
          <span>Medium P40 - 59</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white/50" />
          <span>Standard &lt;40</span>
        </div>
      </div>
    </div>
  );
}
