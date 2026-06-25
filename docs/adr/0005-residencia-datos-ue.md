# ADR-0005 — Residencia de datos en UE

- **Estado:** Aceptado
- **Fecha:** 2026-06-25

## Contexto

Castellar trata datos de salud (categoría especial Art. 9 RGPD). La normativa
europea no prohíbe la transferencia internacional, pero exige garantías
equivalentes (SCC + medidas suplementarias tras Schrems II). Para reducir
riesgo legal, complejidad documental y latencia, decidimos alojar todo en UE.

## Decisión

Todos los proveedores que **almacenan o procesan datos de pacientes** deben
mantener la actividad en la Unión Europea. Listado actual:

| Servicio          | Proveedor          | Región              |
| ----------------- | ------------------ | ------------------- |
| Postgres + Auth   | Supabase           | eu-west-2 (Irlanda) |
| API + Worker      | Render             | Frankfurt           |
| Object storage    | Cloudflare R2      | UE (jurisdicción europea) |
| Redis / colas     | Upstash            | eu-west-1 (Irlanda) |
| Email             | Resend             | UE (Frankfurt)      |
| Errores           | Sentry             | UE (Frankfurt)      |
| Frontend (CDN)    | Cloudflare Pages   | Global edge — sólo metadatos |

Excepciones que **no** procesan datos de pacientes:
- **GitHub** (EE.UU.) aloja el código fuente; sin PII de pacientes ni
  secretos en claro.
- **Cloudflare edge** procesa metadatos de red en cualquier PoP global,
  pero el payload viaja cifrado TLS extremo a extremo.

## Verificación

- Cada subprocesador se documenta en `docs/compliance/subprocessors.md` con
  región y DPA.
- Cambios en proveedores requieren actualización de RAT, DPIA si procede y
  notificación a clínicas cliente con 30 días de antelación.

## Consecuencias

- Algunos servicios populares quedan vetados de facto (Stripe US-only,
  Twilio US-only) salvo que ofrezcan región UE con DPA explícito.
- Sentry usa la región UE explícitamente (sentry.io tiene región US y EU
  como proyectos separados; debemos crear el proyecto en EU).
- Coste ligeramente superior al equivalente US-only; aceptable para el
  segmento sanitario.
