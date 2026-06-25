# Castellar MVP — cierre

> Documento de cierre del MVP. Sprints 0–7 completos. Listos para piloto.

## Scope entregado

| Bounded context | Sprint | Estado |
| --- | --- | --- |
| Multi-tenant + RLS | 0 | ✓ |
| Auth Supabase + MFA | 1 | ✓ |
| Identity (tenants, users, clínicas, invitaciones) | 1 | ✓ |
| Audit log append-only | 1 | ✓ |
| Pacientes + búsqueda pg_trgm | 2 | ✓ |
| Catálogo de tratamientos con `taxRegime` | 2 | ✓ |
| Files con presigned + scan async | 2 | ✓ |
| Consentimientos RGPD versionados | 2 | ✓ |
| Alertas médicas | 2 | ✓ |
| Agenda multi-sede + GIST anti-solape | 3 | ✓ |
| Working hours + excepciones | 3 | ✓ |
| Recordatorios 24 h vía BullMQ + Resend | 3 | ✓ |
| Historia clínica + visitas + notas | 4 | ✓ |
| Regla 24 h + adendas | 4 | ✓ |
| Odontograma persistente con snapshot al cerrar | 4 | ✓ |
| Presupuestos + estados | 5 | ✓ |
| Facturación interna + cadena hash | 5 | ✓ |
| Numeración correlativa atómica | 5 | ✓ |
| Rectificativas | 5 | ✓ |
| Cobros multi-método | 5 | ✓ |
| PDFs react-pdf | 5 | ✓ |
| Dashboard KPIs reales | 6 | ✓ |
| Audit log viewer | 6 | ✓ |
| Export RGPD del paciente | 6 | ✓ |
| Portal paciente v0 (token mágico) | 6 | ✓ |
| Pen test interno OWASP ASVS L2 | 7 | ✓ |
| Rate limit + headers seguridad | 7 | ✓ |
| Sentry + PostHog opt-in | 7 | ✓ |
| Restore drill automatizado | 7 | ✓ |
| Release pipeline CI/CD | 7 | ✓ |
| Happy path E2E Playwright | 7 | ✓ |
| Manual usuario + onboarding piloto | 7 | ✓ |
| Importador CSV pacientes | 7 | ✓ |

## Deuda técnica documentada

Estos puntos están **conscientemente** fuera del MVP y se planifican en
post-MVP. Ningún punto bloquea el piloto.

1. **VERI\*FACTU real.** El modelo de factura está preparado (cadena hash
   estable, `verifactu_*` columnas reservadas, abstracción `BillingProvider`).
   Integración con AEAT en fase específica. Plazos AEAT: 1 ene 2027
   sociedades, 1 jul 2027 resto.
2. **Stripe/Redsys.** En MVP solo cobros manuales. Pasarela online en
   post-MVP.
3. **WhatsApp Business / SMS.** Recordatorios solo email en MVP. Verificación
   Meta a iniciar.
4. **Portal del paciente avanzado.** v0 cubre ver citas+facturas via enlace
   mágico. Falta: firma online de consentimientos, solicitud de cita,
   pago online.
5. **PWA offline.** Fuera del MVP por riesgo de privacidad en dispositivos
   compartidos.
6. **CRM (leads, pipeline, campañas).** Fuera del MVP.
7. **Teleconsulta.** Fuera del MVP.
8. **IA asistencial.** Fuera del MVP.
9. **Reglas de transición de estado de cita más granulares** (p.ej., volver
   de `IN_ROOM` a `CHECKED_IN` por error). Sprint 8.
10. **Renovate + SBOM en CI.** Sprint 8.
11. **Pen test externo + bug bounty.** Tras 3 y 6 meses de piloto.
12. **Plan Starter en Render** ($7/mes) para activar el worker. Mientras el
    piloto sea de carga muy baja, los recordatorios se pueden ejecutar
    desde un cron-job.org gratuito que pegue al endpoint `/health` para
    despertar la API, pero el worker propio sigue siendo lo correcto.
13. **Log retention en Supabase Pro.** Pendiente.

## Criterios de éxito del piloto

A revisar a las 8 semanas del go-live:

- Cero brechas P0/P1 reportadas.
- ≥ 95 % de las citas del piloto gestionadas desde Castellar (no en el
  software anterior).
- ≥ 90 % de las facturas del periodo emitidas desde Castellar.
- p95 endpoints críticos < 300 ms.
- Satisfacción del equipo de la clínica ≥ 7/10 (encuesta).
- Restore drill mensual pasado al menos 2 veces sin incidencias.

## Próximos sprints sugeridos

- **Sprint 8 — Robustez:** dependency scan, SBOM, log retention, Renovate,
  rate limit por usuario, segunda capa local fail-closed, reglas de
  transición de cita más finas.
- **Sprint 9 — VERI\*FACTU:** integración AEAT real, firma con certificado,
  cola de reenvíos, QR en PDF.
- **Sprint 10 — Pagos online:** Stripe Checkout + Redsys + webhook
  reconciliación.
- **Sprint 11 — Portal v1:** firma de consentimientos online, solicitud
  de cita con disponibilidad real, pago online.
- **Sprint 12 — CRM básico:** leads, pipeline, recall dental, presupuestos
  no aceptados.

## Métricas pre-piloto (a archivar)

Llenar antes del go-live:

| Métrica | Valor | Fecha |
| --- | --- | --- |
| Tamaño bundle web (gzip) |  |  |
| Cold start API Render |  |  |
| Tiempo medio /trpc/dashboard.summary |  |  |
| Coberturas test unit (core) |  |  |
| Coberturas test integración (db) |  |  |
| Vulnerabilidades altas en `pnpm audit` | 0 |  |
| Pen test internal: gaps abiertos |  |  |
