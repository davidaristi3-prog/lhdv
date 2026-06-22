'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export interface LiveStop {
  lat: number;
  lng: number;
  label: string;
  seq: number;
  done?: boolean;
}
export interface LiveRoute {
  id: string;
  courierName: string;
  color: string;
  courier?: { lat: number; lng: number } | null;
  stops: LiveStop[];
}
interface Props {
  routes: LiveRoute[];
  height?: number;
}

/**
 * Mapa de seguimiento en vivo con VARIOS domiciliarios a la vez. Cada ruta tiene su
 * color: sus paradas (numeradas; verdes cuando ya se entregaron) y la posición actual
 * del domiciliario (círculo con halo). Basado en DeliveryMap pero multi-ruta.
 */
export function LiveMap({ routes, height = 440 }: Props) {
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

    routes.forEach((r) => {
      r.stops.forEach((s) => {
        const bg = s.done ? '#10b981' : r.color;
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${bg};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.seq}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([s.lat, s.lng], { icon })
          .bindPopup(`<b>${r.courierName}</b><br/><b>${s.seq}.</b> ${s.label}${s.done ? ' ✓' : ''}`)
          .addTo(layer);
        bounds.push([s.lat, s.lng]);
      });

      if (r.courier) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:20px;height:20px"><div style="position:absolute;inset:0;background:${r.color};border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.6)"></div><div style="position:absolute;inset:-6px;border:2px solid ${r.color};border-radius:50%;opacity:.4"></div></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        L.marker([r.courier.lat, r.courier.lng], { icon })
          .bindPopup(`🛵 <b>${r.courierName}</b><br/>ubicación actual`)
          .addTo(layer);
        bounds.push([r.courier.lat, r.courier.lng]);
      }
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [routes]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-xl ring-1 ring-neutral-200"
    />
  );
}
