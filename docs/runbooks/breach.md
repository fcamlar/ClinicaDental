# Runbook — Brecha de seguridad

> Procedimiento de respuesta a incidentes que afecten a datos personales.
> Obligación de notificación a AEPD en **72 h** desde la detección (art. 33 RGPD).

## 1. Detección

Fuentes posibles:
- Alerta de Sentry / Grafana / logs de Postgres.
- Aviso de proveedor (Supabase, Cloudflare, Render).
- Reporte de cliente, usuario interno o investigador externo.
- Hallazgo en revisión de logs de auditoría.

## 2. Contención (primeras 2 h)

1. Designar **Incident Commander** (rotación: persona técnica de guardia).
2. Confirmar el alcance preliminar: ¿qué tenant(s), qué tipo de dato, cuántos
   interesados aproximadamente?
3. Si hay credenciales comprometidas: rotar tokens (Supabase service role,
   R2, Resend, Render, Sentry) — ver `docs/runbooks/secret-rotation.md`.
4. Si hay sesiones de usuario comprometidas: invalidar refresh tokens en
   Supabase Auth y forzar re-login.
5. Si hay vector activo: aislar el componente (apagar API en Render mientras
   se investiga; activar página de mantenimiento en Pages).
6. **No borrar logs.** Preservar evidencia.

## 3. Investigación (primeras 24 h)

1. Reconstruir cronología desde logs (Sentry, Render, Supabase, Cloudflare).
2. Identificar datos afectados con `audit_log`.
3. Clasificar gravedad:
   - **Crítica:** datos de salud filtrados a tercero no autorizado.
   - **Alta:** datos identificativos filtrados; o pérdida de integridad de
     historia clínica.
   - **Media:** acceso indebido contenido (intra-tenant).
   - **Baja:** intento bloqueado por defensa en profundidad.
4. Documentar todo en un ticket privado.

## 4. Notificación

### A la AEPD (≤ 72 h)
- Solo si hay **riesgo para los derechos y libertades**. Salvo casos triviales
  (intento bloqueado), notificar por defecto.
- Formulario electrónico sede AEPD: `https://www.aepd.es/notificaciones`.
- Incluir: naturaleza, categorías y nº aproximado de interesados, medidas
  adoptadas, datos del DPO.

### A las clínicas cliente afectadas
- En cuanto se determine el alcance.
- Plantilla en `docs/compliance/breach-notification-template.md` (Sprint 2).

### A los pacientes
- Si el riesgo para sus derechos y libertades es alto.
- La clínica responsable es quien notifica al paciente; Castellar la asiste
  con los datos técnicos.

## 5. Remediación

1. Aplicar parche.
2. Test post-mortem que reproduzca el escenario y verifique el parche.
3. Actualizar DPIA si se descubre un riesgo nuevo.
4. Revisar tests de regresión en CI.

## 6. Post-mortem

- Blameless. Reunión en los 5 días siguientes.
- Documento público (interno) con: causa raíz, cronología, impacto, acciones.
- Acciones con responsable y fecha; revisión semanal hasta cierre.
