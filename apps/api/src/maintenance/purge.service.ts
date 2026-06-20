import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR } from '../common/uploads';

/** Política: las fotos de evidencia de entrega se conservan máx. 48 h. */
const RETENTION_HOURS = 48;

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  scheduledPurge() {
    return this.purgeOldPhotos(RETENTION_HOURS);
  }

  /** Borra del disco las fotos de pedidos entregados hace más de `maxAgeHours` y limpia la referencia. */
  async purgeOldPhotos(maxAgeHours = RETENTION_HOURS): Promise<{ purged: number }> {
    const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000);
    const orders = await this.prisma.order.findMany({
      where: { deliveryPhotoPath: { not: null }, deliveredAt: { lt: cutoff } },
      select: { id: true, deliveryPhotoPath: true },
    });

    let purged = 0;
    for (const o of orders) {
      if (o.deliveryPhotoPath) {
        try {
          await unlink(join(UPLOADS_DIR, basename(o.deliveryPhotoPath)));
        } catch {
          /* el archivo ya no existe; igual limpiamos la referencia */
        }
      }
      await this.prisma.order.update({ where: { id: o.id }, data: { deliveryPhotoPath: null } });
      purged += 1;
    }

    if (purged > 0) {
      this.logger.log(`Fotos de evidencia purgadas (>${maxAgeHours}h): ${purged}`);
    }
    return { purged };
  }
}
