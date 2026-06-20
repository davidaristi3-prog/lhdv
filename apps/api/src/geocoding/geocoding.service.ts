import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GeoResult {
  lat: number;
  lng: number;
}

/**
 * Geocodificación gratuita con OpenStreetMap (Nominatim). Sin API key.
 * Respeta su política: User-Agent identificable y máx. ~1 consulta/segundo.
 * El día que se quiera más precisión, se reemplaza por Google/Mapbox.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async geocode(query: string): Promise<GeoResult | null> {
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
      this.logger.warn(`Geocoding falló: ${(err as Error).message}`);
      return null;
    }
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

  /** Geocodifica todas las direcciones sin coordenadas (respetando el rate limit). */
  async backfill(): Promise<{ geocoded: number; failed: number; total: number }> {
    const pending = await this.prisma.customerAddress.findMany({ where: { lat: null } });
    let geocoded = 0;
    let failed = 0;
    for (const a of pending) {
      const r = await this.geocodeAddress(a.id);
      if (r) geocoded += 1;
      else failed += 1;
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    return { geocoded, failed, total: pending.length };
  }
}
