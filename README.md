# La Hora del Venado — Sistema de pedidos con IA

Monorepo del sistema de pedidos. Ver la hoja de ruta en [PLAN.md](PLAN.md).

## Stack

- **Backend / worker:** NestJS + Prisma (`apps/api`)
- **Panel web:** Next.js 15 + React 19 + Tailwind v4 (`apps/web`)
- **Lógica compartida:** máquina de estados del pedido + dinero (`packages/shared`)
- **Base de datos:** PostgreSQL (Neon / Supabase) · **Cola:** Redis/Upstash (Fase 2) · **Gestor:** pnpm

## Estructura

```
LHDV/
├─ apps/
│  └─ api/              # NestJS + Prisma (backend y, más adelante, el worker del bot)
│     ├─ prisma/
│     │  ├─ schema.prisma   # modelo de datos
│     │  └─ seed.ts         # catálogo de ejemplo + pedido de prueba
│     └─ src/
│        ├─ health/         # GET /api/health
│        ├─ orders/         # OrdersService.applyTransition (máquina de estados)
│        └─ prisma/         # PrismaService (conexión)
├─ packages/
│  └─ shared/           # order-status.ts (transiciones) · money.ts (COP)
└─ PLAN.md              # hoja de ruta por fases
```

## Requisitos

- Node.js ≥ 20 (probado con 24) · pnpm
- Una base de datos PostgreSQL (ver dos opciones abajo)

## Puesta en marcha

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env        # y completá DATABASE_URL

# 3. Base de datos: aplicar el esquema y generar el cliente
pnpm db:migrate             # crea las tablas (primera migración)

# 4. Datos de ejemplo + pedido de prueba
pnpm db:seed

# 5. Levantar la API (una terminal)
pnpm dev:api                # http://localhost:3001/api/health

# 6. Levantar el panel (otra terminal)
pnpm dev:web                # http://localhost:3000
```

### Credenciales de desarrollo

El seed crea un usuario por rol. Contraseña: **`lhdv1234`**

| Rol | Correo |
|---|---|
| Dueña | mariana@lahoradelvenado.co |
| Cocina | cocina@lahoradelvenado.co |
| Ventas | ventas@lahoradelvenado.co |
| Domicilios | domicilios@lahoradelvenado.co |

### Base de datos — Postgres en la nube

Creá una base gratis en **Neon** (https://neon.tech) o **Supabase**, copiá la
cadena de conexión y pegala en `DATABASE_URL` del `.env`. Para Redis (Fase 2)
se usará **Upstash**.

## Scripts útiles

| Comando | Qué hace |
|---|---|
| `pnpm build` | Compila todos los paquetes |
| `pnpm dev:api` | API en modo watch |
| `pnpm db:migrate` | Crea/aplica migraciones de Prisma |
| `pnpm db:seed` | Carga catálogo de ejemplo + pedido de prueba |
| `pnpm db:studio` | Abre Prisma Studio (explorador de la base) |
| `pnpm db:reset` | Reinicia la base y re-siembra |

## Estado actual

- **Fase 0 (cimientos):** ✅ monorepo, modelo de datos, máquina de estados, Neon.
- **Fase 1 (panel sin IA):** ✅ backend (auth + roles, pedidos, clientes,
  catálogo) y panel Next.js (login, pedidos, alta manual, kanban de cocina,
  clientes, catálogo editable). Pendiente: **importar el Excel** de clientes.
- **Fase 2 (IA WhatsApp):** 🚧 webhook listo (verificación + firma + idempotencia,
  ver [guía Meta](docs/whatsapp-meta-setup.md)). Pendiente: el orquestador de IA.
- **Módulo contable:** ✅ contabilidad de gestión — rentabilidad (ingresos −
  COGS − gastos), gastos y costeo de recetas (sección **Contabilidad**, solo dueña).
- **Zonas de domicilio:** ✅ municipios del Área Metropolitana con costo por zona
  y autodetección desde la dirección (sección **Zonas**).
- **Módulo de domicilios:** ✅ geocoding (OpenStreetMap), rutas ordenadas por
  cercanía con mapa (sección **Domicilios**), y app del domiciliario (**Mi ruta**)
  con navegación, foto de evidencia y ubicación en vivo. Construido con servicios
  gratuitos; upgrades opcionales: Google Maps (rutas óptimas), nube (fotos).

Lo pendiente de la propietaria (pesos por tamaño, precios reales, plantilla de
conversación) reemplaza los *placeholders* del seed. Ver [PLAN.md](PLAN.md).
