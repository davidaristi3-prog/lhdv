import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Carpeta local donde se guardan las fotos de evidencia de entrega. */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

export function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}
