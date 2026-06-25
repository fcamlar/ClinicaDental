# ADR-0002 — Multi-tenant con Row Level Security en Postgres

- **Estado:** Aceptado (pendiente de validación de gate en Sprint 0)
- **Fecha:** 2026-06-25

## Contexto

Castellar gestiona datos de salud (Art. 9 RGPD). Una fuga cross-tenant — que una clínica vea pacientes o facturas de otra — es un evento de **gravedad máxima** (notificación AEPD 72 h, posible cierre del producto).

Necesitamos un patrón que cumpla dos requisitos:

1. **Defensa en profundidad:** que un bug en la capa de aplicación NO baste para filtrar datos cross-tenant.
2. **Productividad:** no obligar al desarrollador a recordar añadir `WHERE tenant_id = ?` en cada consulta.

## Decisión

- **Multi-tenant lógico** en una única base PostgreSQL.
- Cada tabla tenant-scoped lleva columna `tenant_id` (UUID, FK a `tenants`).
- **PostgreSQL Row Level Security activada y forzada** (`FORCE ROW LEVEL SECURITY`) en todas las tablas tenant-scoped.
- Las policies `USING` y `WITH CHECK` comparan `tenant_id` con el resultado de la función `app_current_tenant()`, que lee el setting de transacción `app.current_tenant_id`.
- La aplicación se conecta con un rol **no superuser** (`castellar_app`) sujeto a RLS. Las migraciones se aplican con un rol distinto vía `DATABASE_MIGRATE_URL`.
- El helper `withTenant(tenantId, fn)` en `@castellar/db` envuelve cada caso de uso en `prisma.$transaction` y fija el setting con `set_config('app.current_tenant_id', $1, true)` antes de ejecutar el callback.
- Sin contexto de tenant, `app_current_tenant()` devuelve `NULL` y RLS **bloquea todas las filas por defecto**. Eso es deseable: indica que se olvidó el middleware en algún sitio y se detecta inmediatamente.

## Gate de aceptación (Sprint 0)

El paquete `@castellar/db` incluye `src/__tests__/rls.test.ts` con 6 tests:

1. `withTenant(A)` solo ve datos de A.
2. `withTenant(B)` solo ve datos de B.
3. Sin contexto, RLS bloquea todo.
4. `INSERT` con `tenant_id` ajeno es rechazado por `WITH CHECK`.
5. El tenant activo no persiste entre transacciones.
6. `UPDATE` cross-tenant deja `count = 0`.

**Criterio de paso del gate:** los 6 tests verdes contra Postgres real (docker-compose dev y Supabase EU). Si Prisma+RLS no garantiza esto, **no se construye encima** y se revisa el patrón (clientes parametrizados, query raw para escrituras, etc.).

## Consecuencias

- **Pro:** una segunda barrera independiente de la capa de aplicación. Aunque un bug devuelva una query mal filtrada, RLS la corta.
- **Pro:** el desarrollador escribe `prisma.patient.findMany()` y RLS aplica el filtro automáticamente.
- **Contra:** todas las consultas tenant-scoped deben ir dentro de `withTenant`. La operación de plataforma (crear tenant) requiere camino especial.
- **Contra:** el pool de Prisma comparte conexiones; **`SET LOCAL` debe ir dentro de `$transaction`** para garantizar atomicidad del setting con las queries. El helper lo hace.
- **Contra:** algunas APIs de Prisma (raw queries) pueden requerir cuidado adicional — toda raw query debe pasar por code review.

## Referencias

- [Postgres Row Security Policies](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
- AEPD — Datos de salud Art. 9 RGPD.
