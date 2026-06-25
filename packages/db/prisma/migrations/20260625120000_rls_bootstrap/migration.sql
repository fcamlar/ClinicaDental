-- Castellar RLS bootstrap
--
-- Esta migración se aplica DESPUÉS de la migración inicial generada por Prisma.
-- Activa Row Level Security en todas las tablas tenant-scoped y define políticas
-- basadas en el setting de transacción `app.current_tenant_id`.
--
-- IMPORTANTE: las migraciones se ejecutan como superuser; las políticas no se
-- aplican al superuser por defecto. La app debe conectarse con `castellar_app`,
-- que SÍ está sujeto a RLS.

-- 1. Función auxiliar: obtiene el tenant activo de la transacción.
--    Si no está definido, devuelve NULL y todas las policies fallan (deny by default).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid AS $$
DECLARE
  v_tenant text;
BEGIN
  v_tenant := current_setting('app.current_tenant_id', true);
  IF v_tenant IS NULL OR v_tenant = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_tenant::uuid;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Tabla `tenants`: lectura solo del propio tenant.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON tenants
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

-- 3. Tabla `clinics`: filtrada por tenant_id.
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;

CREATE POLICY clinics_isolation ON clinics
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- 4. Tabla `users`: filtrada por tenant_id.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_isolation ON users
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- 5. Tabla `clinic_members`: filtrada vía join al clínica.
--    Usamos EXISTS para validar que la clínica pertenece al tenant actual.
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members FORCE ROW LEVEL SECURITY;

CREATE POLICY clinic_members_isolation ON clinic_members
  USING (
    EXISTS (
      SELECT 1 FROM clinics c
      WHERE c.id = clinic_members.clinic_id
        AND c.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinics c
      WHERE c.id = clinic_members.clinic_id
        AND c.tenant_id = app_current_tenant()
    )
  );

-- 6. Asegurar permisos al rol de aplicación.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO castellar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON clinics TO castellar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO castellar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_members TO castellar_app;
