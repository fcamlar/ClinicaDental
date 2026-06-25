# Castellar

SaaS de gestión de clínicas dentales — agenda, historia clínica, odontograma, presupuestos y facturación. Construido en TypeScript end-to-end.

> Estado: Sprint 0 (cimientos + spikes técnicos). No usar en producción.

## Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Backend:** NestJS + tRPC + Prisma 6
- **BD:** PostgreSQL 16 con Row Level Security (multi-tenant)
- **Auth:** Supabase Auth + TOTP
- **Storage:** Cloudflare R2
- **Cola:** Upstash Redis + BullMQ
- **Email:** Resend
- **Infra (free tier):** Cloudflare Pages + Render + Supabase + Cloudflare R2 + Upstash + Sentry

## Estructura

```
apps/
  web/        Next.js — back-office + landing
  api/        NestJS — tRPC API + webhooks
  worker/     BullMQ workers
packages/
  db/         Prisma schema, migraciones, seeds
  core/       Dominio puro (sin IO) por bounded context
  api-contracts/  Routers tRPC + Zod compartidos
  ui/         Componentes shadcn extendidos
  auth/       RBAC + helpers Supabase
  billing/    Factura interna con hash + abstracción VERI*FACTU
  pdf/        Plantillas react-pdf
  mailer/     Resend + React Email
  config/     eslint/tsconfig/tailwind/prettier compartidos
  testing/    Fixtures, factories
infra/docker/   docker-compose dev
docs/
  adr/        Architecture Decision Records
  compliance/ RGPD: RAT, DPIA, subprocessors
  runbooks/   Brecha, restore
```

## Requisitos

- Node 22.11.0 (`nvm use`)
- pnpm 9+
- Docker Desktop

## Desarrollo

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar Postgres, Redis, MinIO, Mailhog
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Migrar la base de datos
pnpm db:migrate

# 4. Seed con tenant demo
pnpm db:seed

# 5. Arrancar todo (web + api + worker)
pnpm dev
```

Servicios locales:

| Servicio  | URL                        |
| --------- | -------------------------- |
| Web       | http://localhost:3000      |
| API       | http://localhost:3001      |
| Postgres  | localhost:5432             |
| Redis     | localhost:6379             |
| MinIO     | http://localhost:9001      |
| Mailhog   | http://localhost:8025      |

## Comandos útiles

```bash
pnpm lint           # ESLint en todos los paquetes
pnpm typecheck      # TypeScript --noEmit
pnpm test           # Vitest + Playwright
pnpm format         # Prettier
pnpm db:generate    # Prisma Client
```

## Compliance

Los datos de salud son categoría especial (Art. 9 RGPD). Todo el desarrollo respeta:

- Residencia de datos en UE
- Row Level Security en Postgres por `tenant_id`
- TOTP obligatorio para roles clínicos
- Auditoría de lectura/escritura de historia clínica con motivo
- Cifrado en tránsito (TLS 1.3 + HSTS) y reposo
- Conservación mínima de historia clínica 5 años (Ley 41/2002)

Documentación en `docs/compliance/`.

## Licencia

Propietaria. Todos los derechos reservados.
