# La Hora del Venado — Sistema de pedidos con IA

Monorepo del sistema de pedidos. Ver la hoja de ruta en [PLAN.md](PLAN.md).

## Stack

- **Backend / worker:** NestJS + Prisma (`apps/api`)
- **Panel web:** Next.js (`apps/web`) — *pendiente, Fase 1*
- **Lógica compartida:** máquina de estados del pedido + dinero (`packages/shared`)
- **Base de datos:** PostgreSQL · **Cola:** Redis (BullMQ) · **Gestor:** pnpm

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
├─ docker-compose.yml   # Postgres + Redis locales
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

# 5. Levantar la API
pnpm dev:api                # http://localhost:3001/api/health
```

### Base de datos — opción A: Docker (local)

Requiere Docker Desktop.

```bash
docker compose up -d        # levanta Postgres y Redis
# En .env, dejá la DATABASE_URL de la "Opción A" (ya viene por defecto)
```

### Base de datos — opción B: Postgres en la nube (sin instalar nada)

Si no querés instalar Docker, creá una base gratis en **Neon** (https://neon.tech)
o **Supabase**, copiá la cadena de conexión y pegala en `DATABASE_URL` (opción B
del `.env.example`). Para Redis (Fase 2 en adelante) podés usar **Upstash**.

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

**Fase 0 (cimientos)** en curso: monorepo, modelo de datos, máquina de estados
del pedido y catálogo de ejemplo. Lo pendiente de la propietaria (pesos por
tamaño, precios reales, plantilla de conversación) reemplaza los *placeholders*
del seed. Ver [PLAN.md](PLAN.md).
