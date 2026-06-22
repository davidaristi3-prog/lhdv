'use client';

import { LiveMap } from './LiveMap';

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

/**
 * Mapa de UNA ruta. Es un envoltorio de LiveMap (mismo motor: Google Maps con la key,
 * o OpenStreetMap como respaldo), tratando la ruta como una sola con color azul.
 */
export function DeliveryMap({ stops, courier, height = 360 }: Props) {
  return (
    <LiveMap
      height={height}
      routes={[{ id: 'ruta', courierName: 'Domiciliario', color: '#2563eb', courier: courier ?? null, stops }]}
    />
  );
}
