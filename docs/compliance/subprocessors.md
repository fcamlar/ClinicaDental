# Encargados del tratamiento (subprocesadores) — Castellar

> Lista pública obligatoria art. 28 RGPD. Cualquier cambio se notifica con
> 30 días de antelación a las clínicas cliente.

| Proveedor          | Servicio                  | Región tratamiento | DPA firmado        | Transferencia internacional |
| ------------------ | ------------------------- | ------------------ | ------------------ | --------------------------- |
| Supabase Inc.      | BD Postgres + Auth        | eu-west-2 (Irlanda)| ✓ (DPA Supabase)   | No                          |
| Cloudflare, Inc.   | CDN + Pages + R2 storage  | UE (Frankfurt/Madrid edge) | ✓ (DPA Cloudflare) | EE.UU. — Standard Contractual Clauses + EU-US DPF |
| Render Services    | Hosting API + worker      | Frankfurt          | ✓ (DPA Render)     | No                          |
| Upstash, Inc.      | Redis colas               | eu-west-1 (Irlanda)| ✓ (DPA Upstash)    | No                          |
| Resend, Inc.       | Email transaccional       | UE (Frankfurt)     | ✓ (DPA Resend)     | No                          |
| Sentry (Functional SW) | Errores y trazas      | UE (Frankfurt)     | ✓ (DPA Sentry EU)  | No                          |
| GitHub, Inc.       | Repositorio código        | EE.UU.             | ✓ (DPA GitHub)     | EE.UU. — SCC + DPF.         |

## Notas

1. **Sin transferencia de datos de pacientes a EE.UU.** El código fuente sí
   se aloja en GitHub (EE.UU.), pero el repositorio no contiene datos personales
   de pacientes ni secretos en claro.
2. **Cloudflare** procesa metadatos de red (IPs, URLs) en su edge global. No
   tiene acceso al payload cifrado de las peticiones HTTPS. R2 mantiene el
   objeto en la región configurada (UE).
3. Antes de añadir cualquier proveedor nuevo: revisión por DPO + actualización
   de esta lista + notificación a clínicas + actualización de RAT + DPIA si
   procede.

## Plantilla DPA con clínicas cliente

Castellar firma con cada clínica un DPA bidireccional donde Castellar actúa
como **encargado del tratamiento** respecto a los datos de pacientes que la
clínica (responsable) introduce en la plataforma. Plantilla en
`docs/compliance/dpa-clinics-template.md` (Sprint 1).
