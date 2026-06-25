# Runbook — Restauración de copia de seguridad

> Procedimiento de restore drill mensual + restore real en caso de incidente.

## Estrategia de backups (MVP)

| Capa             | Mecanismo                                  | Frecuencia | Retención |
| ---------------- | ------------------------------------------ | ---------- | --------- |
| Postgres         | Snapshot Supabase (incluye PITR 7 días)    | Continuo   | 7 días free / 30 días Pro |
| Storage (R2)     | Versionado de objetos                      | Por escritura | 30 días |
| Código           | Git en GitHub + tags release               | Continuo   | Infinito |
| Configuración    | render.yaml en repo + secretos en Doppler  | Bajo demanda | — |

> Limitación free tier: Supabase free guarda 7 días. Migración a Pro
> ($25/mes) prevista antes del piloto.

## Restore drill (1 vez al mes)

Objetivo: validar que somos capaces de recuperar la base completa desde
snapshot en < 1 h y que la integridad fiscal (cadena hash de facturas)
sobrevive.

1. Crear proyecto Supabase efímero "castellar-restore-test".
2. Descargar el snapshot más reciente del proyecto productivo.
3. Restaurar el snapshot en el proyecto efímero.
4. Apuntar `DATABASE_MIGRATE_URL` al proyecto efímero.
5. Ejecutar el drill automatizado:

   ```bash
   DATABASE_MIGRATE_URL=postgres://... pnpm exec tsx scripts/restore-drill.ts
   ```

   Salida esperada:
   ```
   ✓ Serie 2026-A: 8 facturas OK
   Drill OK — 8 facturas verificadas en 234 ms (1 series).
   ```

   Si una serie sale corrupta el script sale con código 1 y el número de la
   primera factura inconsistente. Eso bloquea el go al piloto.

6. Verificar manualmente:
   - Cuenta de pacientes coincide con la métrica del último día.
   - Los archivos del último día están en R2 (cross-check de keys).
7. Anotar tiempo total en `docs/runbooks/restore-drills.md`.
8. Destruir el proyecto efímero.

## Restore real (incidente)

1. Activar página de mantenimiento en Cloudflare Pages (toggle).
2. Decidir el punto de restauración (cuándo se produjo el daño).
3. Crear nueva BD desde PITR de Supabase en ese instante.
4. Apuntar `DATABASE_URL` del Render API al nuevo Postgres.
5. Redeploy API y worker.
6. Ejecutar smoke test: login, listar agenda del día, abrir una ficha.
7. Verificar cadena hash (script anterior).
8. Quitar la página de mantenimiento.
9. Comunicar a las clínicas afectadas con el periodo de datos perdidos
   (entre el punto restaurado y el incidente).
10. Post-mortem.

## Métricas objetivo

- **RTO** (recovery time): < 2 h.
- **RPO** (recovery point): < 5 min (gracias a PITR de Supabase Pro).
- **Drill freq.:** mensual; alerta si pasan 35 días sin ejecutar.
