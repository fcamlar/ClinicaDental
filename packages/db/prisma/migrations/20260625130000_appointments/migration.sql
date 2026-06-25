-- Castellar — agenda con anti-solape por profesional y por sala.
--
-- Spike Sprint 0: dos constraints GIST sobre tstzrange. Cualquier intento de
-- insertar una cita que solape (mismo profesional o misma sala, mismo periodo)
-- la rechazará Postgres con SQLSTATE 23P01.
--
-- Las citas canceladas no participan del anti-solape — la condición se filtra
-- por status.

CREATE TYPE appointment_status AS ENUM (
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_ROOM',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED'
);

CREATE TABLE rooms (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rooms_tenant_idx ON rooms(tenant_id);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
CREATE POLICY rooms_isolation ON rooms
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON rooms TO castellar_app;

CREATE TABLE professionals (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  license_number  text,
  specialty       text,
  color           text NOT NULL DEFAULT '#0ea5e9',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX professionals_user_unique ON professionals(user_id);
CREATE INDEX professionals_tenant_idx ON professionals(tenant_id);
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals FORCE ROW LEVEL SECURITY;
CREATE POLICY professionals_isolation ON professionals
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON professionals TO castellar_app;

CREATE TABLE patients (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code            text NOT NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  national_id     text,
  birth_date      date,
  email           text,
  phone           text,
  gdpr_consent_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX patients_tenant_idx ON patients(tenant_id);
CREATE INDEX patients_name_trgm ON patients USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
CREATE POLICY patients_isolation ON patients
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO castellar_app;

CREATE TABLE appointments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  room_id         uuid REFERENCES rooms(id) ON DELETE SET NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'SCHEDULED',
  reason          text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_range CHECK (ends_at > starts_at)
);

CREATE INDEX appointments_tenant_idx ON appointments(tenant_id);
CREATE INDEX appointments_clinic_starts_idx ON appointments(clinic_id, starts_at);
CREATE INDEX appointments_professional_starts_idx ON appointments(professional_id, starts_at);

-- Anti-solape por PROFESIONAL.
--   - tstzrange(starts_at, ends_at, '[)')  → intervalo semiabierto.
--   - WHERE status NOT IN ('CANCELLED','NO_SHOW') excluye citas inactivas.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap_professional EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW'));

-- Anti-solape por SALA (solo cuando la cita tiene sala asignada).
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap_room EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW'));

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_isolation ON appointments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO castellar_app;
