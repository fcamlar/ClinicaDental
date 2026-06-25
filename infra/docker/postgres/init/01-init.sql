-- Castellar dev DB init — extensiones requeridas por el dominio
-- Se ejecuta automáticamente al crear el contenedor postgres por primera vez.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Rol de aplicación (no superuser) que respetará Row Level Security.
-- Prisma se conectará con este rol; el superuser solo se usa para migraciones.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'castellar_app') THEN
    CREATE ROLE castellar_app LOGIN PASSWORD 'castellar_app_dev';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE castellar TO castellar_app;
GRANT USAGE ON SCHEMA public TO castellar_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO castellar_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO castellar_app;
