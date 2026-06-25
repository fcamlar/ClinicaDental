-- Castellar — Sprint 3: scheduling extras.
-- Añade columnas de auditoría rápida a appointments + remindedAt,
-- y crea working_hours / availability_exceptions con RLS.

-- ----------------------------------------------------------------------------
-- appointments: columnas de auditoría rápida + remindedAt.
-- ----------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN reminded_at   timestamptz,
  ADD COLUMN checked_in_at timestamptz,
  ADD COLUMN in_room_at    timestamptz,
  ADD COLUMN completed_at  timestamptz,
  ADD COLUMN no_show_at    timestamptz,
  ADD COLUMN cancelled_at  timestamptz,
  ADD COLUMN cancel_reason text;

-- Índice para el job de recordatorios: encontrar citas pendientes en ventana.
CREATE INDEX appointments_reminder_idx
  ON appointments(tenant_id, reminded_at, starts_at)
  WHERE reminded_at IS NULL AND status IN ('SCHEDULED', 'CONFIRMED');

-- ----------------------------------------------------------------------------
-- working_hours
-- ----------------------------------------------------------------------------
CREATE TABLE working_hours (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week     smallint NOT NULL,
  start_minute    smallint NOT NULL,
  end_minute      smallint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT working_hours_day_check  CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT working_hours_range_check CHECK (end_minute > start_minute AND end_minute <= 1440 AND start_minute >= 0)
);
CREATE INDEX working_hours_lookup_idx
  ON working_hours(tenant_id, professional_id, day_of_week);

ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours FORCE ROW LEVEL SECURITY;
CREATE POLICY working_hours_isolation ON working_hours
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON working_hours TO castellar_app;

-- ----------------------------------------------------------------------------
-- availability_exceptions (vacaciones, festivos, formación, baja)
-- ----------------------------------------------------------------------------
CREATE TABLE availability_exceptions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  clinic_id       uuid REFERENCES clinics(id) ON DELETE CASCADE,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_exceptions_range_check CHECK (ends_at > starts_at)
);
CREATE INDEX availability_exceptions_lookup_idx
  ON availability_exceptions(tenant_id, professional_id, starts_at);

ALTER TABLE availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY availability_exceptions_isolation ON availability_exceptions
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_exceptions TO castellar_app;
