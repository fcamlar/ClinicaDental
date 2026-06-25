-- Castellar — Sprint 2: pacientes extendidos, consentimientos, alertas,
-- archivos y catálogo de tratamientos.

-- ----------------------------------------------------------------------------
-- Enums nuevos
-- ----------------------------------------------------------------------------
CREATE TYPE patient_sex AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

CREATE TYPE consent_type AS ENUM (
  'GDPR', 'TREATMENT', 'SURGERY', 'ORTHODONTICS', 'IMPLANT',
  'ENDODONTICS', 'MARKETING', 'IMAGE_RIGHTS'
);

CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE alert_category AS ENUM (
  'ALLERGY', 'MEDICATION', 'CONDITION', 'PROCEDURE_RISK', 'OTHER'
);

CREATE TYPE file_owner_type AS ENUM ('PATIENT', 'CONSENT', 'BUDGET', 'INVOICE');
CREATE TYPE scan_status AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

CREATE TYPE tax_regime AS ENUM (
  'EXEMPT_HEALTHCARE', 'STANDARD_AESTHETIC', 'STANDARD_PRODUCT',
  'REDUCED', 'NOT_SUBJECT'
);

-- ----------------------------------------------------------------------------
-- patients: añadir columnas nuevas (la tabla ya existe de Sprint 0)
-- ----------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN national_id_hash text,
  ADD COLUMN sex patient_sex,
  ADD COLUMN address_line1 text,
  ADD COLUMN address_line2 text,
  ADD COLUMN postal_code text,
  ADD COLUMN city text,
  ADD COLUMN country char(2) NOT NULL DEFAULT 'ES',
  ADD COLUMN admin_notes text,
  ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX patients_national_id_hash_idx ON patients(tenant_id, national_id_hash);
CREATE INDEX patients_deleted_at_idx ON patients(tenant_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- files
-- ----------------------------------------------------------------------------
CREATE TABLE files (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type      file_owner_type NOT NULL,
  owner_id        uuid NOT NULL,
  s3_key          text NOT NULL UNIQUE,
  mime            text NOT NULL,
  size            integer NOT NULL,
  filename        text NOT NULL,
  uploaded_by_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  scan_status     scan_status NOT NULL DEFAULT 'PENDING',
  scan_result     text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX files_owner_idx ON files(tenant_id, owner_type, owner_id);
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY files_isolation ON files
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON files TO castellar_app;

-- ----------------------------------------------------------------------------
-- consents
-- ----------------------------------------------------------------------------
CREATE TABLE consents (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id         uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type               consent_type NOT NULL,
  text               text NOT NULL,
  text_hash          text NOT NULL,
  signed_at          timestamptz NOT NULL,
  ip                 text,
  recorded_by_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  document_file_id   uuid REFERENCES files(id) ON DELETE SET NULL,
  revoked_at         timestamptz
);
CREATE INDEX consents_patient_idx ON consents(tenant_id, patient_id);
CREATE INDEX consents_type_idx ON consents(tenant_id, type);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
CREATE POLICY consents_isolation ON consents
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
-- Append-mostly: actualizar solo `revoked_at`. Borrar prohibido desde la app.
GRANT SELECT, INSERT, UPDATE ON consents TO castellar_app;
REVOKE DELETE ON consents FROM castellar_app;

-- ----------------------------------------------------------------------------
-- medical_alerts
-- ----------------------------------------------------------------------------
CREATE TABLE medical_alerts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  severity      alert_severity NOT NULL,
  category      alert_category NOT NULL,
  label         text NOT NULL,
  details       text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX medical_alerts_patient_idx ON medical_alerts(tenant_id, patient_id);
ALTER TABLE medical_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY medical_alerts_isolation ON medical_alerts
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON medical_alerts TO castellar_app;

-- ----------------------------------------------------------------------------
-- treatments (catálogo)
-- ----------------------------------------------------------------------------
CREATE TABLE treatments (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code           text NOT NULL,
  name           text NOT NULL,
  description    text,
  default_price  integer NOT NULL,
  tax_regime     tax_regime NOT NULL DEFAULT 'EXEMPT_HEALTHCARE',
  category       text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT treatments_price_check CHECK (default_price >= 0)
);
CREATE INDEX treatments_tenant_idx ON treatments(tenant_id);
CREATE INDEX treatments_active_idx ON treatments(tenant_id, active);
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments FORCE ROW LEVEL SECURITY;
CREATE POLICY treatments_isolation ON treatments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON treatments TO castellar_app;
