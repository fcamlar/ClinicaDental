# Registro de Actividades de Tratamiento (RAT) — Castellar

> Documento vivo, art. 30 RGPD. Se actualiza al añadir un nuevo flujo de datos
> personales. Última revisión: Sprint 0.

## Datos del responsable

- **Responsable del tratamiento:** [Razón social pendiente] — `[CIF]`
- **Contacto:** `dpo@castellar.app` (a contratar — ver `docs/compliance/subprocessors.md`).
- **Delegado de Protección de Datos (DPO):** externo, en proceso de contratación
  (condición previa al Sprint 1).

## Actividades

### 1. Gestión de clínicas dentales (servicio principal)

| Campo                       | Detalle |
| --------------------------- | ------- |
| **Finalidad**               | Prestar el SaaS de gestión de clínica dental: pacientes, agenda, historia clínica, presupuestos, facturación. |
| **Base jurídica**           | Ejecución de contrato (art. 6.1.b RGPD) + obligación legal en facturación (art. 6.1.c) + consentimiento explícito para datos de salud (art. 9.2.h: tratamiento por profesional sanitario obligado al secreto). |
| **Categorías de datos**     | Identificativos (nombre, NIF/DNI/NIE), contacto (email, teléfono), nacimiento, sexo, **datos de salud** (historia clínica, odontograma, radiografías), económicos (facturas, cobros). |
| **Categorías de interesados** | Pacientes; usuarios internos (dentistas, recepción, contabilidad); tutores legales de menores. |
| **Destinatarios**           | Personal autorizado de la clínica titular. Hacienda (AEAT) para facturación. Encargados del tratamiento (ver subprocessors). |
| **Transferencias internacionales** | No. Todos los proveedores tienen tratamiento en UE. |
| **Plazo de conservación**   | Historia clínica: 5 años desde el último contacto (Ley 41/2002, art. 17). Facturación: 4-6 años (LGT). Datos comerciales: hasta revocación del consentimiento. |
| **Medidas de seguridad**    | Cifrado en tránsito (TLS 1.3) y reposo (Supabase TDE + `pgcrypto` en columnas hipersensibles). MFA TOTP obligatorio para roles clínicos. Row Level Security en Postgres por tenant. Auditoría con motivo en lectura de historia clínica. Backups diarios con restore drill. |

### 2. Autenticación y soporte

| Campo                       | Detalle |
| --------------------------- | ------- |
| **Finalidad**               | Identificación del usuario y soporte técnico al cliente del SaaS. |
| **Base jurídica**           | Ejecución de contrato. |
| **Categorías de datos**     | Email, hash de contraseña, MFA secret (cifrado), IP, user-agent, logs de acceso. |
| **Plazo**                   | Mientras dure la relación contractual + 1 año. |

### 3. Marketing del producto (post-MVP)

| Campo                       | Detalle |
| --------------------------- | ------- |
| **Finalidad**               | Comunicaciones comerciales sobre Castellar (no sobre pacientes). |
| **Base jurídica**           | Consentimiento explícito del cliente SaaS. |
| **Plazo**                   | Hasta revocación. |

## Derechos del interesado (ARSULIPO)

- **Acceso:** export de paciente vía UI (Sprint 6) → ZIP con JSON + PDFs.
- **Rectificación:** edición directa en ficha de paciente; el log mantiene historial.
- **Supresión:** soft-delete inmediato; purga física tras retención legal.
- **Limitación:** marca `restricted` en paciente; sólo lectura para auditoría legal.
- **Portabilidad:** mismo export que acceso, formato JSON estructurado.
- **Oposición:** revocación de consentimiento de marketing; clínica decide
  sobre datos clínicos según marco legal.
