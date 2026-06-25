# Plantilla de DPA (Contrato de Encargado del Tratamiento)

> Plantilla v1 — Castellar SaaS de gestión dental.
>
> Este DPA bidireccional regula la relación entre Castellar (encargado del
> tratamiento) y la clínica cliente (responsable del tratamiento). Se firma
> digitalmente en el onboarding. Revisable por DPO externo antes del piloto.

## 1. Partes

- **Responsable del tratamiento** — la clínica cliente, identificada en
  el contrato de servicio.
- **Encargado del tratamiento** — Castellar [pendiente razón social].

## 2. Objeto

Castellar pone a disposición del Responsable un SaaS de gestión clínica que
trata, en nombre del Responsable, datos personales de sus pacientes, usuarios
internos y terceros relacionados.

## 3. Tipos de datos y categorías de interesados

- **Datos identificativos:** nombre, apellidos, NIF/NIE/DNI, fecha de nacimiento.
- **Datos de contacto:** email, teléfono, dirección.
- **Datos especialmente protegidos (Art. 9 RGPD):** datos de salud,
  historia clínica, odontograma, alertas médicas, consentimientos.
- **Datos económicos:** facturas, presupuestos, cobros.
- **Interesados:** pacientes, tutores legales de menores, usuarios internos.

## 4. Naturaleza, finalidad y duración

- **Naturaleza:** procesamiento automatizado en la nube.
- **Finalidad:** prestación del servicio SaaS (gestión clínica integral).
- **Duración:** mientras dure el contrato + plazos de retención legal
  (5 años historia clínica, 6 años contabilidad).

## 5. Obligaciones del encargado (Castellar)

1. Tratar los datos exclusivamente conforme a instrucciones documentadas
   del Responsable (lo que el SaaS permite).
2. Confidencialidad del personal autorizado.
3. Medidas técnicas y organizativas conformes al Art. 32 RGPD: cifrado en
   tránsito (TLS 1.3) y reposo, Row Level Security, MFA TOTP obligatorio,
   auditoría inmutable con motivo de acceso, backups diarios.
4. No subcontratar sin autorización previa del Responsable; lista pública
   de subencargados en `docs/compliance/subprocessors.md`. Cambios
   notificados con 30 días.
5. Asistir al Responsable en derechos ARSULIPO (acceso, rectificación,
   supresión, limitación, portabilidad, oposición) — interfaz disponible
   en el back-office.
6. Asistir en notificación de brechas a la AEPD (72 h).
7. Devolver o suprimir los datos al fin del contrato, salvo retención legal.
8. Permitir auditorías razonables al Responsable.

## 6. Sub-encargados

Lista en `docs/compliance/subprocessors.md`. Todos en territorio UE para
servicios que procesan datos de pacientes:

| Sub-encargado | Servicio | Región |
| --- | --- | --- |
| Supabase | Postgres + Auth | eu-central-1 (Frankfurt) |
| Render | Hosting de API y worker | eu-central-1 (Frankfurt) |
| Cloudflare | Pages, R2, edge | UE (Frankfurt/Madrid) |
| Upstash | Redis (colas) | eu-west-1 (Irlanda) |
| Resend | Email transaccional | UE (Frankfurt) |
| Sentry | Telemetría de errores | UE (Frankfurt) |

GitHub (código fuente) está en EE.UU. pero no procesa datos personales de
pacientes; opera bajo Standard Contractual Clauses + EU-US Data Privacy
Framework para metadatos de los usuarios internos del repositorio.

## 7. Brechas de seguridad

Castellar notificará al Responsable cualquier brecha que afecte a sus
datos sin demora indebida y en cualquier caso dentro de las 24 h desde su
detección, con la información disponible (`docs/runbooks/breach.md`).

## 8. Aplicación

Este DPA prevalece sobre cualquier cláusula contradictoria del contrato de
servicio. Modificaciones solo por escrito firmadas por ambas partes.
