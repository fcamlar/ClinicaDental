# ADR-0003 — Autenticación con Supabase Auth

- **Estado:** Aceptado
- **Fecha:** 2026-06-25
- **Reemplaza:** decisión previa de usar Auth.js con credenciales gestionadas en repo.

## Contexto

El MVP necesita autenticación con MFA (TOTP obligatorio para roles clínicos),
invitaciones por email, magic link y persistencia segura de contraseñas. Hacer
todo eso a mano con Auth.js + Prisma cuesta dos sprints y aumenta la superficie
de seguridad propia.

## Decisión

Delegar autenticación en **Supabase Auth** (incluido en el plan free hasta
50 k MAU):

- Email + password con hashing gestionado por Supabase.
- TOTP nativo (`MFA enroll` + `verify`).
- Magic link transaccional (Sprint 1+ para portal de paciente).
- Invitaciones por email mediante `admin.inviteUserByEmail` desde el backend.

El mapeo `supabaseUserId → tenantId + role + clinicIds` se hace en una función
SQL `castellar_access_token_hook` que enriquece el JWT con
`app_metadata.castellar.*`. La API lee esos claims, los valida (firma JWKS de
Supabase) y construye el contexto tRPC.

Ver `packages/db/prisma/migrations/20260625140000_auth_claims_hook/migration.sql`
y `apps/api/src/auth/supabase.ts`.

## Alternativas descartadas

- **Auth.js + Prisma:** demasiada superficie propia para MVP; requiere
  implementar MFA y rotación de tokens. Migrable después si Supabase deja de
  satisfacer.
- **Clerk:** excelente DX pero coste elevado y residencia US.
- **Auth0:** mismo problema de coste y compliance UE.

## Consecuencias

- Acoplamiento controlado a Supabase. Migrable: el modelo `User` mantiene
  email y rol propios, sólo el `supabase_user_id` ata.
- TOTP se exige tras el primer login (Sprint 1) para roles
  `OWNER`, `ADMIN_CLINIC`, `DENTIST`, `HYGIENIST`.
- El JWT NO contiene PII (sólo IDs y rol). La API valida con JWKS sin
  comunicarse con Supabase en cada request.
