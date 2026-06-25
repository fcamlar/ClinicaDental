# Evaluación de Impacto en Protección de Datos (DPIA) — Castellar

> Art. 35 RGPD. Aplica porque se tratan **datos de salud (categoría especial,
> art. 9)** a gran escala. Es **obligatorio** antes de iniciar el tratamiento.

## 1. Descripción del tratamiento

Castellar es un SaaS multi-tenant que permite a clínicas dentales gestionar:
agenda, pacientes, historia clínica, odontograma, presupuestos y facturación.

- **Naturaleza:** automatizado, en la nube, con acceso vía web.
- **Alcance:** datos de salud, identificativos, económicos. Volumen estimado
  MVP: 1 clínica × 300 pacientes. Objetivo a 12 meses: 50 clínicas × 1 000.
- **Contexto:** sector sanitario privado. Profesionales obligados al secreto.
- **Finalidad:** ver RAT (art. 1).

## 2. Necesidad y proporcionalidad

- **Necesidad:** la gestión clínica requiere persistir historia clínica
  estructurada — alternativas en papel no son viables a escala.
- **Proporcionalidad:** se recogen únicamente datos clínicamente útiles.
  No se realizan tratamientos automatizados con efectos jurídicos significativos
  sobre el paciente (sin scoring crediticio, sin perfilado IA en MVP).

## 3. Riesgos identificados

| # | Riesgo                                                       | Probabilidad | Impacto | Severidad |
| - | ------------------------------------------------------------ | ------------ | ------- | --------- |
| 1 | Fuga cross-tenant (clínica A ve datos de clínica B)          | Baja         | Crítico | Alta      |
| 2 | Acceso indebido por personal de la clínica (curiosidad)      | Media        | Alto    | Alta      |
| 3 | Pérdida de datos por fallo del proveedor cloud               | Baja         | Crítico | Media     |
| 4 | Ransomware sobre estaciones de la clínica con sesión abierta | Media        | Alto    | Alta      |
| 5 | Brecha de credenciales (phishing)                            | Media        | Alto    | Alta      |
| 6 | Subida de malware como adjunto clínico                       | Media        | Medio   | Media     |
| 7 | Subprocesador fuera de UE (transferencia internacional)      | Baja         | Alto    | Media     |
| 8 | Borrado accidental de historia clínica                       | Baja         | Crítico | Media     |

## 4. Medidas de mitigación

| # | Medida                                                            | Sprint |
| - | ----------------------------------------------------------------- | ------ |
| 1 | Row Level Security en Postgres + tests cross-tenant en CI         | 0      |
| 2 | Auditoría de lectura/escritura de historia clínica con motivo     | 4      |
| 2 | RBAC declarativo por rol                                          | 1      |
| 3 | Backups diarios + restore drill mensual                           | 7      |
| 4 | Sesión expira en 8 h; pantalla de bloqueo a 15 min                | 1      |
| 5 | MFA TOTP obligatorio para roles clínicos                          | 1      |
| 5 | Bcrypt para password (lo gestiona Supabase Auth)                  | 0      |
| 6 | Escaneo asíncrono ClamAV; cuarentena hasta resolución             | 2      |
| 7 | Lista pública de subprocesadores, todos en UE; cláusulas DPA      | 0      |
| 8 | Soft-delete + papelera; purga física tras retención legal         | 6      |

## 5. Consultas

- **DPO:** revisión obligatoria antes del Sprint 4 (historia clínica).
- **Asesor fiscal:** revisión obligatoria antes del Sprint 5 (facturación).
- **AEPD:** consulta previa solo si el riesgo residual es alto tras mitigación
  (no se prevé necesario con las medidas anteriores).

## 6. Revisión

Este DPIA se revisa al menos anualmente y antes de cualquier cambio
significativo (p.ej., introducción de IA sobre historia clínica, integración
con aseguradoras).
