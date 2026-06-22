import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface GeoResult {
  lat: number;
  lng: number;
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
}

/**
 * Geocodificación de direcciones. Usa Google Geocoding como principal (más
 * preciso para direcciones colombianas) cuando hay `GOOGLE_MAPS_API_KEY`, y cae
 * a OpenStreetMap/Nominatim (gratis, sin key) como respaldo o si Google no
 * encuentra el punto. Sin key configurada, funciona solo con Nominatim.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async geocode(query: string): Promise<GeoResult | null> {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (key) {
      const fromGoogle = await this.geocodeGoogle(query, key);
      if (fromGoogle) return fromGoogle;
      // Si Google no encontró (o falló), intentamos con Nominatim igual.
    }
    return this.geocodeNominatim(query);
  }

  private async geocodeGoogle(query: string, key: string): Promise<GeoResult | null> {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?components=country:CO&address=' +
      encodeURIComponent(query) +
      '&key=' +
      key;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as GoogleGeocodeResponse;
      if (data.status !== 'OK' || !data.results?.length) {
        // ZERO_RESULTS es normal (caemos a Nominatim); otros estados son config.
        if (data.status && data.status !== 'ZERO_RESULTS') {
          this.logger.warn(`Google geocoding status ${data.status}: ${data.error_message ?? ''}`);
        }
        return null;
      }
      const loc = data.results[0].geometry?.location;
      if (!loc) return null;
      return { lat: loc.lat, lng: loc.lng };
    } catch (err) {
      this.logger.warn(`Google geocoding falló: ${(err as Error).message}`);
      return null;
    }
  }

  private async geocodeNominatim(query: string): Promise<GeoResult | null> {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=' +
      encodeURIComponent(query);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LaHoraDelVenado/1.0 (sistema de pedidos)' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!data.length) return null;
      return { lat: Number.parseFloat(data[0].lat), lng: Number.parseFloat(data[0].lon) };
    } catch (err) {
      this.logger.warn(`Geocoding (Nominatim) falló: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Tiempo real de manejo (en segundos) de `origin` a `dest` según Google Directions.
   * Devuelve null si no hay key o si Google no responde, para que el llamador caiga a
   * la distancia en línea recta.
   */
  async drivingSeconds(origin: GeoResult, dest: GeoResult): Promise<number | null> {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!key) return null;
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}` +
      `&destination=${dest.lat},${dest.lng}&key=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        status: string;
        error_message?: string;
        routes?: Array<{ legs?: Array<{ duration?: { value: number } }> }>;
      };
      if (data.status !== 'OK' || !data.routes?.length) {
        if (data.status && data.status !== 'ZERO_RESULTS') {
          this.logger.warn(`Google directions status ${data.status}: ${data.error_message ?? ''}`);
        }
        return null;
      }
      const dur = data.routes[0].legs?.[0]?.duration?.value;
      return typeof dur === 'number' ? dur : null;
    } catch (err) {
      this.logger.warn(`Google directions falló: ${(err as Error).message}`);
      return null;
    }
  }

  /** Prueba rápida de que la API key de Google responde (geocoding + directions). */
  async diagnose() {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!key) return { hasKey: false, geocoding: false, directions: false };
    const geo = await this.geocodeGoogle('Cra. 25 #12 Sur 59, Medellín, Colombia', key);
    const dir = await this.drivingSeconds(
      { lat: 6.1862251, lng: -75.5622073 },
      { lat: 6.2102251, lng: -75.5702073 },
    );
    return {
      hasKey: true,
      geocoding: geo != null,
      geocodingResult: geo,
      directions: dir != null,
      directionsSeconds: dir,
    };
  }

  /** Geocodifica una dirección de la agenda y guarda las coordenadas. */
  async geocodeAddress(addressId: string): Promise<GeoResult | null> {
    const addr = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!addr) return null;

    const query = [addr.address, addr.zone, 'Medellín', 'Colombia'].filter(Boolean).join(', ');
    const result = await this.geocode(query);
    if (result) {
      await this.prisma.customerAddress.update({
        where: { id: addressId },
        data: { lat: result.lat, lng: result.lng, geocodedAt: new Date() },
      });
    }
    return result;
  }

  /**
   * Geocodifica direcciones de la agenda. Por defecto solo las que no tienen coordenadas;
   * con `force` re-geocodifica TODAS (útil al activar Google para rehacer las que se
   * habían resuelto con OpenStreetMap). Con Google el rate limit es mucho menor que Nominatim.
   */
  async backfill(force = false): Promise<{ geocoded: number; failed: number; total: number }> {
    const pending = await this.prisma.customerAddress.findMany({
      where: force ? {} : { lat: null },
    });
    const hasGoogle = !!this.config.get<string>('GOOGLE_MAPS_API_KEY');
    let geocoded = 0;
    let failed = 0;
    for (const a of pending) {
      const r = await this.geocodeAddress(a.id);
      if (r) geocoded += 1;
      else failed += 1;
      await new Promise((resolve) => setTimeout(resolve, hasGoogle ? 150 : 1100));
    }
    return { geocoded, failed, total: pending.length };
  }
}
