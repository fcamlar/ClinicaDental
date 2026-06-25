# ADR-0004 — Facturación con hash interno y provider abstracto VERI\*FACTU

- **Estado:** Aceptado
- **Fecha:** 2026-06-25

## Contexto

La AEAT exige que los sistemas de facturación remitan registros a VERI\*FACTU
de forma electrónica, segura, íntegra, automática y fehaciente. Plazos:
sociedades **1 enero 2027**, resto **1 julio 2027**.

Integrar VERI\*FACTU completo (envío AEAT, cadena hash AEAT, QR, sandbox,
gestión de errores) dentro del MVP de 16 semanas añade riesgo: la
especificación aún recibe revisiones y el camino fiscal sanitario (exento /
sujeto / mixto) requiere asesoría especializada.

## Decisión

**MVP — preparación, no integración**:

- Modelo `Invoice` inmutable: una vez emitida, no se edita; correcciones por
  anulación + factura rectificativa.
- **Cadena hash interna** por `(tenantId, series)` con `prevHash` y
  `internalHash`. El algoritmo está documentado y versionado (`v1`) en
  `packages/billing/src/invoice.ts`.
- **Provider abstracto** (`BillingProvider`) cuyo único implementador en MVP
  es `NULL_BILLING_PROVIDER` (no envía nada).
- Régimen fiscal por línea (`taxRegime`): `EXEMPT_HEALTHCARE`,
  `STANDARD_AESTHETIC`, `STANDARD_PRODUCT`, `REDUCED`, `NOT_SUBJECT`.

**Post-MVP** (antes del 1 ene 2027 para sociedades):

- Implementación `VerifactuProvider` que firma con certificado FNMT, envía
  el registro a AEAT, almacena código de cotejo y URL QR.
- Mantenimiento de cadena: la cadena interna se mantiene incluso si AEAT
  está caída; el envío diferido se reintenta.
- Adaptador `TicketBaiProvider` para clientes en País Vasco.

## Reglas de inmutabilidad (Sprint 0)

1. No editar factura emitida (`status != DRAFT`). Test cubre el caso.
2. Hash canónico estable (v1) — JSON con orden fijo de claves.
3. Cadena por `(tenantId, series)`.
4. Control de concurrencia al numerar: futuro lock `SELECT ... FOR UPDATE`
   sobre `tenant + series` en Sprint 5.

## Asesoría obligatoria

- **Asesor fiscal sanitario** contratado en Sprint 0; valida el modelo
  `taxRegime` antes de Sprint 5.
- Catálogo de tratamientos incluye `taxRegime` por defecto editable por la
  clínica para casos límite.

## Consecuencias

- El MVP factura legalmente válida en PDF, pero **no transmite a AEAT**.
  Las clínicas piloto deben estar avisadas y, si su obligación VERI\*FACTU
  aplica antes de la integración, complementar con su software anterior.
- La migración a VERI\*FACTU real no requiere rehacer la cadena: se mapea
  `internalHash` → `verifactuHash` cuando llegue el envío.
