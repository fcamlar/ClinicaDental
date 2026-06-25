# ADR-0001 — Stack tecnológico

- **Estado:** Aceptado
- **Fecha:** 2026-06-25
- **Contexto:** Sprint 0 del MVP de Castellar.

## Decisión

Stack TypeScript end-to-end con infraestructura gratuita durante el MVP:

| Capa             | Elección                                          |
| ---------------- | ------------------------------------------------- |
| Lenguaje         | TypeScript estricto                               |
| Frontend         | Next.js 15 (App Router) + React 19                |
| UI               | Tailwind v4 + shadcn/ui + Radix + lucide          |
| Datos cliente    | tRPC v11 + TanStack Query                         |
| Forms            | React Hook Form + Zod                             |
| i18n             | next-intl (ES por defecto; EN y pt-BR preparados) |
| Backend          | NestJS + tRPC adapter                             |
| ORM              | Prisma 6                                          |
| BD               | PostgreSQL 16 (Supabase EU) con RLS               |
| Cola/caché       | Upstash Redis free + BullMQ                       |
| Storage          | Cloudflare R2 free (MinIO en dev)                 |
| Auth             | Supabase Auth + TOTP obligatorio para roles clínicos |
| Email            | Resend free (Mailhog en dev)                      |
| Observabilidad   | Sentry free                                       |
| Hosting web      | Cloudflare Pages                                  |
| Hosting API      | Render free                                       |
| Secretos         | GitHub Secrets + env vars en hosting              |

## Alternativas consideradas

- **Fastify** como backend → descartado a favor de NestJS por modularidad explícita y menor riesgo de duplicidad con `apps/web`. Sujeto a un mini-spike en Sprint 0; volver a Fastify si el adaptador tRPC añade fricción.
- **Auth.js manual** → descartado a favor de Supabase Auth para acelerar MVP. Migrable después sin tocar el modelo.
- **Vercel + Fly + Doppler + Terraform** → descartado por coste. Volveremos a evaluar tras el piloto.

## Consecuencias

- Coste mensual del MVP ≈ 0 €.
- Limitaciones del tier gratuito (Render duerme tras 15 min, Supabase 500 MB) son aceptables para piloto, no para producción real con varias clínicas. Migración a planes de pago planificada antes del Sprint 8.
- Tipos compartidos front/back vía `packages/api-contracts` evitan duplicación de validación.
