import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR, ensureUploadsDir } from './common/uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });

  // Fotos de evidencia de entrega (almacenamiento local).
  ensureUploadsDir();
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  console.log(`API LHDV escuchando en http://localhost:${port}/api`);
}

void bootstrap();
