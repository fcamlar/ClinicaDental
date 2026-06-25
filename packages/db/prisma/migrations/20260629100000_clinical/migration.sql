-- Castellar — Sprint 4: historia clínica.
-- Tablas clinical_records, visits, clinical_notes, odontograms.
-- Nota: la regla "edit hasta 24h, después solo adendas" se aplica en el dominio.
-- BD protege adicionalmente con trigger: si locked_at no es NULL, no se permite
-- UPDATE del body. Las adendas son filas hijas con parent_note_id.

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
CREATE TYPE visit_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE note_type AS ENUM (
  'EVOLUTION', 'DIAGNOSIS', 'TREATMENT_PLAN', 'PRESCRIPTION', 'REFERRAL', 'OTHER'
);

-- ----------------------------------------------------------------------------
-- clinical_records — singleton por paciente.
-- ----------------------------------------------------------------------------
CREATE TABLE clinical_records (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id  uuid NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  opened_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinical_records_tenant_idx ON clinical_records(tenant_id);
ALTER TABLE clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_records FORCE ROW LEVEL SECURITY;
CREATE POLICY clinical_records_isolation ON clinical_records
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON clinical_records TO castellar_app;
-- DELETE prohibido — la retención legal es 5 años desde el último contacto.
REVOKE DELETE ON clinical_records FROM castellar_app;

-- ----------------------------------------------------------------------------
-- visits
-- ----------------------------------------------------------------------------
CREATE TABLE visits (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id       uuid NOT NULL REFERENCES clinical_records(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL,
  appointment_id  uuid UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL,
  closed_at       timestamptz,
  motive          text,
  status          visit_status NOT NULL DEFAULT 'OPEN',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_tenant_patient_idx ON visits(tenant_id, patient_id);
CREATE INDEX visits_record_started_idx ON visits(record_id, started_at DESC);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits FORCE ROW LEVEL SECURITY;
CREATE POLICY visits_isolation ON visits
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON visits TO castellar_app;
REVOKE DELETE ON visits FROM castellar_app;

-- ----------------------------------------------------------------------------
-- clinical_notes — editables hasta locked_at, después solo adendas.
-- ----------------------------------------------------------------------------
CREATE TABLE clinical_notes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id      uuid NOT NULL REFERENCES clinical_records(id) ON DELETE CASCADE,
  visit_id       uuid REFERENCES visits(id) ON DELETE SET NULL,
  author_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type           note_type NOT NULL DEFAULT 'EVOLUTION',
  body           text NOT NULL,
  parent_note_id uuid REFERENCES clinical_notes(id) ON DELETE RESTRICT,
  locked_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinical_notes_record_idx
  ON clinical_notes(tenant_id, record_id, created_at DESC);
CREATE INDEX clinical_notes_visit_idx ON clinical_notes(visit_id);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY clinical_notes_isolation ON clinical_notes
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON clinical_notes TO castellar_app;
REVOKE DELETE ON clinical_notes FROM castellar_app;

-- Defensa en profundidad: trigger que rechaza UPDATE de body/type cuando la
-- nota ya está bloqueada. El dominio también lo valida; este trigger es el
-- "deja-tú-de-equivocarte" para queries directas.
CREATE OR REPLACE FUNCTION clinical_notes_block_locked_edit() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'clinical_note locked — only addendums allowed'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clinical_notes_block_locked_edit_trg
BEFORE UPDATE ON clinical_notes
FOR EACH ROW EXECUTE FUNCTION clinical_notes_block_locked_edit();

-- ----------------------------------------------------------------------------
-- odontograms — uno por visita.
-- ----------------------------------------------------------------------------
CREATE TABLE odontograms (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id    uuid NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  state_json  jsonb NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX odontograms_tenant_idx ON odontograms(tenant_id);

ALTER TABLE odontograms ENABLE ROW LEVEL SECURITY;
ALTER TABLE odontograms FORCE ROW LEVEL SECURITY;
CREATE POLICY odontograms_isolation ON odontograms
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON odontograms TO castellar_app;
REVOKE DELETE ON odontograms FROM castellar_app;

-- Trigger: no se puede mutar `state_json` si la visita asociada está CLOSED.
CREATE OR REPLACE FUNCTION odontograms_block_closed_edit() RETURNS trigger AS $$
DECLARE
  v_status visit_status;
BEGIN
  SELECT status INTO v_status FROM visits WHERE id = NEW.visit_id;
  IF v_status = 'CLOSED' AND NEW.state_json IS DISTINCT FROM OLD.state_json THEN
    RAISE EXCEPTION 'visit closed — odontogram is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER odontograms_block_closed_edit_trg
BEFORE UPDATE ON odontograms
FOR EACH ROW EXECUTE FUNCTION odontograms_block_closed_edit();
