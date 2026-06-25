# Onboarding de la clínica piloto

> Procedimiento paso a paso para arrancar a la primera clínica en
> Castellar. Plazo objetivo: 5 días laborables desde firma del contrato
> hasta operación normal.

## D-7: pre-arranque

- [ ] Firma del contrato de servicio.
- [ ] Firma del DPA (`docs/compliance/dpa-clinics-template.md`) con la clínica.
- [ ] Recopilar datos de la clínica:
  - Razón social y CIF.
  - Dirección y zona horaria.
  - Horario laboral (días y franjas).
  - Listado de profesionales (nombre, especialidad, nº colegiado).
  - Series de facturación deseadas (típicamente `<año>-A`).
- [ ] Pedir un export del software anterior (CSV de pacientes).
- [ ] Confirmar que la clínica acepta:
  - Que VERI\*FACTU se integrará en una fase posterior (no en MVP).
  - Que el portal paciente está en versión 0.
  - Que el SMS/WhatsApp se incorpora post-MVP.

## D-3: provisión

- [ ] Crear tenant en producción (`/onboarding`).
- [ ] Cargar series de facturación.
- [ ] Importar pacientes desde CSV (`/settings/import`).
- [ ] Cargar catálogo de tratamientos personalizado (si la clínica tiene precios
      propios, ajustar después del seed por defecto).
- [ ] Invitar a los usuarios reales y verificar que reciben el email y
      configuran TOTP.

## D-1: ensayo

- [ ] Sesión de formación (~2 h) con el equipo de la clínica:
  - Agenda y flujo del paciente.
  - Ficha de paciente + historia clínica.
  - Odontograma.
  - Presupuestos y facturas.
  - Cobros y caja.
  - Auditoría y export RGPD (solo titular y administración).
- [ ] Resolución de dudas; recoger sugerencias.

## D0: go-live asistido

- [ ] Presencial o videollamada todo el día.
- [ ] La recepción crea las citas reales del día y nosotros monitorizamos
      el funcionamiento (Sentry, logs, telemetría).
- [ ] Al final del día: review breve, plan de mejora para D+1.

## D+1 a D+14: soporte intensivo

- [ ] Canal directo (Slack Connect / WhatsApp con el OWNER).
- [ ] Stand-up diario los primeros 5 días, semanal después.
- [ ] Recoger feedback estructurado al final de cada semana.
- [ ] KPIs internos:
  - Errores P0/P1 (cero).
  - Citas atendidas con éxito vs. planificadas.
  - Facturas emitidas correctamente.
  - Tiempos de respuesta de la API (`p95 < 300 ms`).
  - Quejas u observaciones del personal.

## Criterios go / no-go

**Antes de D0:**
- Migraciones aplicadas correctamente en Supabase.
- Tests integración Sprint 0–6 verdes en CI.
- `pen-test-internal.md` revisado y firmado por DPO.
- `restore-drill.ts` ejecutado correctamente sobre snapshot reciente.
- `release.yml` ejecutado con éxito en producción.
- Manual entregado a la clínica.

**Antes de quitar el soporte intensivo (D+14):**
- 0 incidentes P0 en las 2 últimas semanas.
- Equipo de la clínica usa la plataforma autónomamente para flujos básicos.
- Al menos una facturación de jornada completa cuadrada con su contabilidad.

## Plan de salida (si algo falla)

Si en cualquier punto la clínica pide salir:
- Exportar todos sus pacientes (export RGPD por paciente o batch para
  `Sprint 8` — pendiente).
- Borrar tenant tras 30 días (retención mínima legal contemplada en DPA).
- Reembolso prorrateado según contrato.
