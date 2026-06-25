-- Castellar — Sprint 5: presupuestos, facturación interna y pagos.

CREATE TYPE budget_status AS ENUM (
  'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'
);
CREATE TYPE invoice_status AS ENUM (
  'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOIDED'
);
CREATE TYPE invoice_kind AS ENUM ('STANDARD', 'RECTIFICATIVE');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER');

-- ----------------------------------------------------------------------------
-- invoice_series
-- ----------------------------------------------------------------------------
CREATE TABLE invoice_series (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id   uuid REFERENCES clinics(id) ON DELETE CASCADE,
  code        text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT invoice_series_last_check CHECK (last_number >= 0)
);
CREATE INDEX invoice_series_tenant_idx ON invoice_series(tenant_id);
ALTER TABLE invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_series FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_series_isolation ON invoice_series
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON invoice_series TO castellar_app;
REVOKE DELETE ON invoice_series FROM castellar_app;

-- ----------------------------------------------------------------------------
-- budgets
-- ----------------------------------------------------------------------------
CREATE TABLE budgets (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  status        budget_status NOT NULL DEFAULT 'DRAFT',
  issued_at     timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz,
  sent_at       timestamptz,
  accepted_at   timestamptz,
  rejected_at   timestamptz,
  converted_at  timestamptz,
  invoice_id    uuid,
  subtotal      integer NOT NULL DEFAULT 0,
  tax_total     integer NOT NULL DEFAULT 0,
  total         integer NOT NULL DEFAULT 0,
  notes         text,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX budgets_patient_idx ON budgets(tenant_id, patient_id);
CREATE INDEX budgets_status_idx ON budgets(tenant_id, status);
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY budgets_isolation ON budgets
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON budgets TO castellar_app;

CREATE TABLE budget_lines (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  budget_id    uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES treatments(id) ON DELETE SET NULL,
  description  text NOT NULL,
  tooth_ref    smallint,
  quantity     integer NOT NULL DEFAULT 1,
  unit_price   integer NOT NULL,
  discount     double precision NOT NULL DEFAULT 0,
  tax_regime   tax_regime NOT NULL DEFAULT 'EXEMPT_HEALTHCARE',
  net_amount   integer NOT NULL,
  tax_amount   integer NOT NULL,
  total_amount integer NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  CONSTRAINT budget_lines_qty_check CHECK (quantity > 0),
  CONSTRAINT budget_lines_discount_check CHECK (discount >= 0 AND discount < 1)
);
CREATE INDEX budget_lines_budget_idx ON budget_lines(budget_id, position);
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_lines_isolation ON budget_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_lines TO castellar_app;

-- ----------------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------------
CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  series_id       uuid NOT NULL REFERENCES invoice_series(id) ON DELETE RESTRICT,
  number          integer NOT NULL,
  kind            invoice_kind NOT NULL DEFAULT 'STANDARD',
  rectifies_id    uuid UNIQUE REFERENCES invoices(id),
  issued_at       timestamptz NOT NULL,
  status          invoice_status NOT NULL DEFAULT 'ISSUED',
  subtotal        integer NOT NULL,
  tax_total       integer NOT NULL,
  total           integer NOT NULL,
  paid_total      integer NOT NULL DEFAULT 0,
  prev_hash       text,
  internal_hash   text NOT NULL,
  verifactu_id    text,
  verifactu_status text,
  verifactu_qr_url text,
  customer_notes  text,
  created_by_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, series_id, number),
  CONSTRAINT invoices_number_check CHECK (number > 0),
  CONSTRAINT invoices_paid_check CHECK (paid_total >= 0)
);
CREATE INDEX invoices_patient_idx ON invoices(tenant_id, patient_id);
CREATE INDEX invoices_issued_idx ON invoices(tenant_id, issued_at DESC);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_isolation ON invoices
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
-- Las facturas son inmutables salvo status y campos VERI*FACTU.
GRANT SELECT, INSERT, UPDATE ON invoices TO castellar_app;
REVOKE DELETE ON invoices FROM castellar_app;

-- Trigger: bloquea cualquier UPDATE que toque los campos protegidos.
CREATE OR REPLACE FUNCTION invoices_block_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.number IS DISTINCT FROM OLD.number
    OR NEW.series_id IS DISTINCT FROM OLD.series_id
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.prev_hash IS DISTINCT FROM OLD.prev_hash
    OR NEW.internal_hash IS DISTINCT FROM OLD.internal_hash
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.rectifies_id IS DISTINCT FROM OLD.rectifies_id THEN
    RAISE EXCEPTION 'invoice fields are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_block_mutation_trg
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION invoices_block_mutation();

-- ----------------------------------------------------------------------------
-- FK añadida ahora que invoices existe.
-- ----------------------------------------------------------------------------
ALTER TABLE budgets
  ADD CONSTRAINT budgets_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- invoice_lines
-- ----------------------------------------------------------------------------
CREATE TABLE invoice_lines (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  treatment_id uuid REFERENCES treatments(id) ON DELETE SET NULL,
  description  text NOT NULL,
  tooth_ref    smallint,
  quantity     integer NOT NULL DEFAULT 1,
  unit_price   integer NOT NULL,
  discount     double precision NOT NULL DEFAULT 0,
  tax_regime   tax_regime NOT NULL DEFAULT 'EXEMPT_HEALTHCARE',
  net_amount   integer NOT NULL,
  tax_amount   integer NOT NULL,
  total_amount integer NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  CONSTRAINT invoice_lines_qty_check CHECK (quantity > 0),
  CONSTRAINT invoice_lines_discount_check CHECK (discount >= 0 AND discount < 1)
);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines(invoice_id, position);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_isolation ON invoice_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
-- Las líneas son inmutables — se insertan junto con la factura en una sola
-- transacción y no se editan.
GRANT SELECT, INSERT ON invoice_lines TO castellar_app;
REVOKE UPDATE, DELETE ON invoice_lines FROM castellar_app;

-- ----------------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  method         payment_method NOT NULL,
  amount         integer NOT NULL,
  paid_at        timestamptz NOT NULL,
  reference      text,
  recorded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  voided_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);
CREATE INDEX payments_invoice_idx ON payments(tenant_id, invoice_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_isolation ON payments
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE ON payments TO castellar_app;
REVOKE DELETE ON payments FROM castellar_app;
