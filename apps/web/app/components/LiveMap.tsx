'use client';

import { useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView } from '@react-google-maps/api';
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

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Mapa de seguimiento con varios domiciliarios. Cada ruta tiene su color: sus paradas
 * (verdes si ya se entregaron) y la posición actual del domiciliario (círculo con halo).
 * Usa Google Maps cuando hay `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; si no, cae a OpenStreetMap.
 */
export function LiveMap(props: Props) {
  if (KEY) return <GoogleLiveMap {...props} />;
  return <LeafletLiveMap {...props} />;
}

// ─── Google Maps ──────────────────────────────────────────────
function GoogleLiveMap({ routes, height = 440 }: Props) {
  const { isLoaded } = useJsApiLoader({ id: 'lhdv-gmap', googleMapsApiKey: KEY as string });

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      const b = new google.maps.LatLngBounds();
      let any = false;
      for (const r of routes) {
        for (const s of r.stops) {
          b.extend({ lat: s.lat, lng: s.lng });
          any = true;
        }
        if (r.courier) {
          b.extend(r.courier);
          any = true;
        }
      }
      if (any) map.fitBounds(b, 48);
    },
    [routes],
  );

  if (!isLoaded) {
    return <div style={{ height }} className="w-full animate-pulse rounded-xl bg-neutral-100" />;
  }

  const offsetCenter = (w: number, h: number) => ({ x: -(w / 2), y: -(h / 2) });

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height, borderRadius: '0.75rem' }}
      center={{ lat: 6.2442, lng: -75.5812 }}
      zoom={12}
      onLoad={onLoad}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
    >
      {routes.flatMap((r) =>
        r.stops.map((s, i) => (
          <OverlayView
            key={`${r.id}-s${i}`}
            position={{ lat: s.lat, lng: s.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={offsetCenter}
          >
            <div
              title={`${r.courierName} — ${s.seq}. ${s.label}`}
              style={{
                background: s.done ? '#10b981' : r.color,
                color: '#fff',
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,.4)',
              }}
            >
              {s.seq}
            </div>
          </OverlayView>
        )),
      )}
      {routes
        .filter((r) => r.courier)
        .map((r) => (
          <OverlayView
            key={`${r.id}-c`}
            position={r.courier as { lat: number; lng: number }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(w) => ({ x: -(w / 2), y: -22 })}
          >
            <div
              title={`🛵 ${r.courierName}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: r.color,
                  border: '3px solid #fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}
              >
                🛵
              </div>
              <div
                style={{
                  marginTop: 3,
                  padding: '1px 7px',
                  borderRadius: 9,
                  background: r.color,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                }}
              >
                {r.courierName}
              </div>
            </div>
          </OverlayView>
        ))}
    </GoogleMap>
  );
}

// ─── OpenStreetMap (respaldo, sin key) ────────────────────────
function LeafletLiveMap({ routes, height = 440 }: Props) {
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
          html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:44px;height:44px;border-radius:50%;background:${r.color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:24px">🛵</div><div style="margin-top:3px;padding:1px 7px;border-radius:9px;background:${r.color};color:#fff;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">${r.courierName}</div></div>`,
          iconSize: [80, 66],
          iconAnchor: [40, 22],
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
