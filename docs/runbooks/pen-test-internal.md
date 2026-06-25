# Pen test interno — OWASP ASVS L2 (Sprint 7)

> Auditoría aplicada antes del piloto. Cobertura: capítulos V2 (autenticación),
> V3 (sesiones), V4 (control de acceso), V5 (validación), V7 (errores y logs),
> V8 (protección de datos), V9 (comunicaciones), V14 (configuración).
> Fecha: pre-piloto. Revisor recomendado tras el piloto: DPO externo.

## Resumen ejecutivo

| Categoría | Estado | Comentario |
|---|---|---|
| V2 Autenticación | ✓ | Supabase Auth + TOTP obligatorio para roles clínicos. |
| V3 Sesiones | ✓ | JWT corto + refresh; portal con token de un solo flujo, hash en BD. |
| V4 Control acceso | ✓ | RBAC en dominio + RLS Postgres en BD (defensa en profundidad). |
| V5 Validación | ✓ | Zod en boundary tRPC; DNI con letra de control; tipos fuertes. |
| V7 Errores / logs | ◐ | Sentry sin PII. Pendiente: rotación de logs Postgres. |
| V8 Protección datos | ✓ | RLS, hashing nationalId, cifrado TDE Supabase, R2 cifrado en reposo. |
| V9 Comunicaciones | ✓ | TLS 1.3, HSTS, CSP estricto, CORS por origin. |
| V14 Configuración | ◐ | Headers seguridad ✓. Pendiente: SBOM + CI dependency scan. |

## V2 — Autenticación

- **2.1.1** Mínimo 8 caracteres en contraseña → Supabase Auth lo enforza.
- **2.1.10** Bloqueo tras N intentos fallidos → rate limit en `/trpc` + Supabase lockout.
- **2.2.1** MFA disponible → TOTP via Supabase; **obligatorio** para roles clínicos
  (guard `mfaProtectedProcedure` rechaza con `PRECONDITION_FAILED`).
- **2.3.1** Tokens revocables → `supabase.auth.signOut()` + refresh tokens persistidos.

## V3 — Sesiones

- **3.2.3** Cookies con SameSite, HttpOnly, Secure → gestionadas por Supabase SSR helpers.
- **3.3.1** Timeout absoluto → JWT 15 min + refresh 30 d.
- **3.5.1** Logout invalida la sesión → invalida refresh en BD.

## V4 — Control de acceso

- **4.1.1** Reglas de acceso bien definidas → RBAC declarativo en `packages/auth`.
- **4.1.3** Validación servidor-side → cada caso de uso valida rol; RLS Postgres como
  segunda barrera.
- **4.2.1** Forzar autorización por defecto → `protectedProcedure` por defecto;
  `publicProcedure` solo en endpoints público explícitos (createTenant,
  acceptInvitation, portal.exchangeToken).
- **4.3.1** Audit log accesos sensibles → `audit_log` append-only en BD (DELETE/UPDATE
  revocados), lectura de historia clínica y pacientes registra `reason` obligatorio.

## V5 — Validación de entrada

- **5.1.3** Validación tipada → Zod en routers tRPC con esquemas estrictos.
- **5.1.5** Sanitización HTML → no usamos `dangerouslySetInnerHTML`; emails con
  `escapeHtml`.
- **5.2.4** SQL injection → Prisma con queries parametrizadas; `$queryRaw` solo en
  3 sitios revisados (RLS spike, pg_trgm search, reserve next number).
- **5.5.2** Deserialización segura → JSON nativo solo; sin eval.

## V7 — Errores y logs

- **7.1.1** Logs no contienen credenciales → sí: middleware Sentry filtra `user.email`
  e `ip_address`. Plain tokens del portal nunca se loguean (solo hashes).
- **7.1.2** Logs estructurados → JSON parcial en producción; pending: estandarizar
  pino/winston en Sprint 8.
- **7.2.1** Logs sincronizados → todos los servicios envían a Sentry EU.
- **Gap detectado:** Postgres logs en Supabase se rotan automáticamente pero no
  los exportamos. Acción: configurar log retention 30 días en Supabase Pro.

## V8 — Protección de datos

- **8.1.1** Cifrado en reposo → Supabase Postgres TDE; R2 con AES-256.
- **8.1.4** Datos sensibles minimizados → `nationalId` se almacena pero la búsqueda
  va por `nationalIdHash`; `password` no se almacena (Supabase).
- **8.2.1** Datos clasificados → categoría especial Art. 9 RGPD para clínicos.
- **8.3.1** Retención documentada → 5 años historia clínica, 6 años contabilidad.
  Soft-delete + purga programada.
- **Auditado cross-tenant**: tests integración en `packages/db` cubren aislamiento.

## V9 — Comunicaciones

- **9.1.1** TLS 1.3 obligatorio → Cloudflare Pages y Render lo enforzan.
- **9.1.2** HSTS → header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **9.2.1** Certificados válidos → gestionados por Cloudflare/Render.
- **9.2.4** CSP estricta → `frame-ancestors 'none'`, `connect-src` whitelist.

## V14 — Configuración

- **14.2.1** Dependencias actualizadas → pnpm con renovate (a configurar Sprint 8).
- **14.4.1** Headers seguridad → ver `apps/api/src/security/middleware.ts` y
  `apps/web/src/middleware.ts`.
- **14.5.3** CORS → origin específico, no comodín.
- **Gap detectado:** SBOM (CycloneDX). Acción: añadir a CI release pipeline.

## Acciones derivadas (post-piloto)

1. Configurar Renovate para bumps automáticos de dependencias.
2. Generar SBOM en cada release y archivar 1 año.
3. Pen test externo (third-party) tras 3 meses de piloto.
4. Bug bounty privado tras 6 meses (HackerOne private program).
5. Revisar SAML/SCIM para clientes enterprise (post-MVP, no piloto).
