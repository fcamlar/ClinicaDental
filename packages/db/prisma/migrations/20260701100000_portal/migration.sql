-- Castellar — Sprint 6: portal del paciente.

CREATE TABLE portal_access_tokens (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  uses_left    integer NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  CONSTRAINT portal_uses_check CHECK (uses_left >= 0)
);
CREATE INDEX portal_tokens_patient_idx
  ON portal_access_tokens(tenant_id, patient_id);

ALTER TABLE portal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_access_tokens FORCE ROW LEVEL SECURITY;
-- Las policies normales filtran por tenant cuando lo hay. El canjeo del
-- token, sin tenant activo, usa el rol superuser (DATABASE_MIGRATE_URL).
CREATE POLICY portal_tokens_isolation ON portal_access_tokens
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON portal_access_tokens TO castellar_app;
REVOKE DELETE ON portal_access_tokens FROM castellar_app;
