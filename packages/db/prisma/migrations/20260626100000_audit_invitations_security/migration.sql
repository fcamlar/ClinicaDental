-- Castellar — auditoría + invitaciones + seguridad de usuario (Sprint 1).

CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  ip            text,
  user_agent    text,
  reason        text,
  diff          jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_at_idx ON audit_log(tenant_id, at DESC);
CREATE INDEX audit_log_resource_idx ON audit_log(resource_type, resource_id);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_isolation ON audit_log
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT ON audit_log TO castellar_app;
-- audit_log NO se actualiza ni borra desde la app (append-only).
REVOKE UPDATE, DELETE ON audit_log FROM castellar_app;

CREATE TABLE invitations (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL,
  role           role NOT NULL,
  invited_by_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token          text NOT NULL UNIQUE,
  expires_at     timestamptz NOT NULL,
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX invitations_tenant_idx ON invitations(tenant_id);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
-- Las invitaciones se canjean en endpoint público: la consulta por token
-- usa el rol superuser fuera de RLS. Solo lectura/escritura dentro del
-- tenant pasa la policy.
CREATE POLICY invitations_isolation ON invitations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO castellar_app;

CREATE TABLE user_security (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mfa_required      boolean NOT NULL DEFAULT false,
  mfa_enrolled_at   timestamptz,
  last_login_at     timestamptz,
  last_login_ip     text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- Heredamos el tenant del user vía join.
ALTER TABLE user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_security FORCE ROW LEVEL SECURITY;
CREATE POLICY user_security_isolation ON user_security
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_security.user_id
        AND u.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_security.user_id
        AND u.tenant_id = app_current_tenant()
    )
  );
GRANT SELECT, INSERT, UPDATE ON user_security TO castellar_app;
