# Publicar La Hora del Venado (pruebas)

Objetivo: dejar el sistema en una URL pública para compartir con otras personas y
probar. **Panel (Next.js) → Vercel · API (NestJS) → Render · Base de datos → Neon
(ya está).** Todo gratis.

> El orden importa: primero la **API** (Render), porque el panel necesita su URL.

---

## 0. Cuentas (gratis, registrate con tu GitHub)

- **GitHub** — https://github.com (para el código)
- **Render** — https://render.com (la API)
- **Vercel** — https://vercel.com (el panel)

---

## 1. Subir el código a GitHub

La forma más fácil sin línea de comandos: **GitHub Desktop**.

1. Instalá GitHub Desktop (https://desktop.github.com) e iniciá sesión.
2. **File → Add local repository** → elegí la carpeta `C:\Users\DA\Desktop\LHDV`.
3. **Publish repository** → ponele nombre (ej. `lhdv`), dejalo **privado** si querés,
   y publicá. Eso sube los 20 commits a GitHub.

> Alternativa por terminal (si tenés un token de GitHub configurado):
> `git remote add origin https://github.com/TU_USUARIO/lhdv.git` y `git push -u origin main`.

---

## 2. Desplegar la API en Render

1. En Render: **New → Blueprint** → conectá tu cuenta de GitHub → elegí el repo `lhdv`.
   Render detecta el archivo `render.yaml` y propone el servicio **lhdv-api**.
2. Antes de crear, te pedirá las variables marcadas como "sync: false". Pegá:
   - `DATABASE_URL` → la cadena **pooled** de Neon (la misma de tu `.env`).
   - `DIRECT_URL` → la cadena **directa** de Neon (la misma de tu `.env`).
   - (`JWT_SECRET` se genera solo; `BAKERY_LAT/LNG` ya vienen con un default.)
3. **Apply / Create**. Render instala, migra la base y arranca. Toma unos minutos.
4. Cuando termine, copiá la **URL del servicio**, algo como
   `https://lhdv-api.onrender.com`. Probala: `https://lhdv-api.onrender.com/api/health`
   debe responder `{"status":"ok","db":"up"}`.

> Si preferís sin Blueprint: **New → Web Service** → repo `lhdv`, y copiá a mano el
> `buildCommand`/`startCommand`/env del `render.yaml`.

---

## 3. Desplegar el panel en Vercel

1. En Vercel: **Add New → Project** → importá el repo `lhdv`.
2. **Root Directory:** seleccioná `apps/web`.
3. Framework: Next.js (lo detecta solo). No cambies el build command.
4. En **Environment Variables**, agregá:
   - `NEXT_PUBLIC_API_URL` = la URL de Render **+ `/api`**, ej.
     `https://lhdv-api.onrender.com/api`
5. **Deploy**. En un par de minutos te da la URL del panel, ej.
   `https://lhdv.vercel.app`.

---

## 4. ¡Listo! Compartir y probar

- Compartí la **URL de Vercel** (`https://lhdv.vercel.app`).
- Cualquiera entra y se loguea con los usuarios de prueba (contraseña `lhdv1234`):
  `mariana@lahoradelvenado.co` (dueña), `cocina@…`, `ventas@…`, `domicilios@…`.

> La base es la **misma de Neon**, así que los datos (usuarios, catálogo, zonas) ya
> están. Si querés empezar de cero, corré `pnpm db:reset` local apuntando a esa base.

---

## Cosas a saber (modo pruebas)

- **Primera carga lenta:** el plan free de Render **duerme** el servicio tras ~15 min
  sin uso; la primera petición después tarda ~30–60 s en despertar. Normal en pruebas.
- **Fotos de evidencia:** se guardan en el disco del servidor, que en Render es
  **efímero** (se borra al redeployar). Con la purga de 48 h no importa para pruebas;
  para producción real se mueven a la nube (R2/S3).
- **Geocoding:** sigue con OpenStreetMap (gratis). El upgrade a Google es opcional.
- **Costos:** todo en plan gratuito. Render/Vercel/Neon free alcanzan para pruebas.

## Actualizar después

Cada vez que hagas `git push` (o publiques desde GitHub Desktop), **Render y Vercel
redepliegan solos**. No hay que hacer nada más.
