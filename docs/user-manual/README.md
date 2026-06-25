# Manual de Castellar — clínica piloto

> Manual de uso para personal de clínica dental. Versión MVP.

## 1. Primeros pasos

### 1.1 Crear la cuenta de la clínica

1. Recibirás un email de Castellar con un enlace para crear la cuenta de
   "titular" (rol OWNER).
2. Establece contraseña en Supabase Auth.
3. Configura **verificación en dos pasos (2FA)** con tu app de autenticación
   (Google Authenticator, Authy, 1Password, etc.). Es **obligatorio** para
   roles clínicos.
4. Rellena los datos de tu clínica (nombre, dirección, CIF, zona horaria).

### 1.2 Invitar al equipo

`Configuración → Usuarios → Invitar usuario`.

| Rol | Permisos resumidos |
| --- | --- |
| Titular (OWNER) | Todo |
| Administración | Gestión usuarios, agenda, facturación, sin historia clínica |
| Dentista | Pacientes, historia clínica, odontograma, presupuestos |
| Higienista | Agenda, historia clínica limitada, odontograma |
| Recepción | Agenda, pacientes, cobros |
| Contabilidad | Facturas, cobros, informes |

El usuario invitado recibe un email con un enlace válido 7 días para
fijar contraseña y configurar 2FA.

## 2. Gestión diaria

### 2.1 Agenda

`Agenda` muestra el día actual por profesional. Atajos:
- Flechas para navegar día anterior/siguiente. Botón "Hoy" para volver.
- Selector de sede arriba a la derecha.
- Click en un hueco vacío → diálogo "Nueva cita". Busca al paciente por
  nombre o código, elige profesional y duración (15–120 min) y guarda.
- Click sobre una cita → ver detalle y cambiar estado (Llegada → En gabinete → Atendida).
- Las citas no se borran: se anulan con "Cancelar" (motivo opcional).

### 2.2 Pacientes

`Pacientes` permite buscar por nombre, apellido o código (la búsqueda
tolera erratas — pg_trgm).

**Crear paciente**: `Nuevo paciente`. Campos obligatorios: nombre, apellidos
y sede. DNI/NIE/NIF con validación de letra de control. Acepta el
consentimiento RGPD por defecto (recomendado).

**Acceder a la ficha**: Castellar te pedirá un motivo de acceso cada vez
que abras la ficha. Eso queda registrado en auditoría (Ley 41/2002).

### 2.3 Historia clínica

Desde la ficha del paciente, "Ir a historia clínica".

- Lista de visitas a la izquierda. Click para ver una visita pasada.
- Botón "Abrir visita" si el paciente está en la clínica.
- Odontograma:
  - Selecciona una **condición** en la paleta (caries, obturación, etc.).
  - Click en una superficie del diente para aplicarla.
  - Click en el contorno para aplicar condiciones globales (ausente, corona).
- Notas: añadir/editar dentro de las primeras 24 h. Después, **adenda**.
- Cerrar visita: bloquea el odontograma y las notas pasadas.

### 2.4 Presupuestos

`Presupuestos → Nuevo`. Selecciona paciente y sede. Añade líneas:

- Desde el catálogo de tratamientos (autocompletado), o manual.
- Indica pieza dental (FDI) si aplica.
- Cantidad, descuento y régimen fiscal (por defecto, "Sanitario exento").

Estados:
- **Borrador** → editable.
- **Enviado** → al cliente. Permite aceptar/rechazar.
- **Aceptado** → se puede convertir en factura.
- **Rechazado / Expirado** → cerrado.
- **Facturado** → convertido en factura.

### 2.5 Facturación

`Facturas` lista todas. Se generan exclusivamente desde un presupuesto
aceptado (botón "Convertir en factura").

- Cada factura tiene serie y número correlativos.
- La cadena hash interna se muestra al final de la ficha (auditoría).
- **Anular**: emite una factura rectificativa con importes en negativo. La
  original queda VOIDED. Los pagos quedan marcados.

Cobros: en la ficha de factura, formulario inline. Acepta efectivo, tarjeta,
transferencia, online, otro. Permite varios cobros parciales hasta cubrir
el total.

## 3. Cumplimiento RGPD

### 3.1 Auditoría

`Configuración → Auditoría` (solo Titular y Administración). Filtra por
recurso (patient, invoice, visit, …). Cada lectura de historia clínica deja
una entrada con el motivo que indicaste.

### 3.2 Exportar datos del paciente

En la ficha del paciente, botón "Exportar datos RGPD". Pide motivo (queda
registrado) y descarga un JSON con toda la información asociada (consentimientos,
alertas, visitas, facturas, citas, archivos).

Cumple Art. 15 (acceso) y Art. 20 (portabilidad) del RGPD.

### 3.3 Borrar paciente

En la ficha del paciente. **Soft-delete**: el paciente desaparece de listas
pero la historia clínica se conserva 5 años (Ley 41/2002). La purga física
es automática tras el plazo.

## 4. Portal del paciente

`Pacientes → ficha → "Enviar enlace al portal"`. El paciente recibe un
email con un enlace válido 72 horas (hasta 10 accesos). Desde el portal
puede ver sus próximas citas y sus facturas. La firma online de
consentimientos llega en post-MVP.

## 5. Importar pacientes existentes

`Configuración → Importar`. Pega CSV con cabecera:

```
firstName,lastName,nationalId,birthDate,email,phone,city,notes
```

El sistema valida cada fila, omite duplicados (mismo DNI normalizado) y
muestra un resumen.

## 6. Troubleshooting

- **No me llega el código 2FA**: usa el código de recuperación que generaste
  al configurar TOTP, o pídeselo al Titular para que reinicie tu MFA.
- **La cita no se guarda — "el profesional ya tiene otra cita"**: hay un
  solape. Comprueba la agenda del profesional para ese hueco.
- **No puedo editar una nota de hace dos días**: tras 24 h queda bloqueada.
  Usa el botón "Añadir adenda".
- **El presupuesto no se convierte en factura**: debe estar en estado
  "Aceptado" y la serie de facturación tiene que estar activa.

## 7. Soporte

`soporte@castellar.app` · respuesta en horario laboral L–V 9:00–19:00.
Para incidencias críticas (no se puede facturar, no hay agenda), llama al
teléfono que aparece en tu contrato.
