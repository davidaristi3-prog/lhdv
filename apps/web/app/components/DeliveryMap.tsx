'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export interface MapStop {
  lat: number;
  lng: number;
  label: string;
  seq: number;
  done?: boolean;
}

interface Props {
  stops: MapStop[];
  courier?: { lat: number; lng: number } | null;
  height?: number;
}

export function DeliveryMap({ stops, courier, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([6.2442, -75.5812], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    stops.forEach((s) => {
      const bg = s.done ? '#10b981' : '#111827';
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${bg};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([s.lat, s.lng], { icon }).bindPopup(`<b>${s.seq}.</b> ${s.label}`).addTo(layer);
      bounds.push([s.lat, s.lng]);
    });

    if (courier) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#2563eb;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([courier.lat, courier.lng], { icon }).bindPopup('Domiciliario').addTo(layer);
      bounds.push([courier.lat, courier.lng]);
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [stops, courier]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-xl ring-1 ring-neutral-200"
    />
  );
}
