-- PontoNexo · migração de segurança
-- 1) papel de aplicação com permissões mínimas
-- 2) gatilhos que tornam os registros de ponto, comprovantes, tratamentos e auditoria somente-inclusão
-- 3) RLS por empregador
-- 4) funções SECURITY DEFINER estreitas para o que precisa cruzar empregadores

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pontonexo_app') THEN
    -- Em produção o papel é criado pela operação com LOGIN e senha; aqui só garante a existência.
    CREATE ROLE pontonexo_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- ───────────── Dados de referência ─────────────
INSERT INTO roles (code, name, description) VALUES
  ('employer_owner', 'Empregador (titular)', 'Responsável legal pelo registro. Decide correções, fecha o mês e administra o acesso.'),
  ('employer_manager', 'Gestor delegado', 'Opera cadastros e decide correções. Não administra usuários, configurações nem fechamento.'),
  ('accountant', 'Contador', 'Somente leitura de espelhos, relatórios e exportações.'),
  ('employee', 'Funcionário', 'Marca o próprio ponto e consulta os próprios registros.')
ON CONFLICT (code) DO NOTHING;

-- ───────────── Permissões ─────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pontonexo_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO pontonexo_app;

-- UPDATE só onde há estado operacional legítimo
GRANT UPDATE ON
  employers, users, user_roles, sessions, password_reset_tokens, job_roles, employees,
  employment_contracts, work_locations, geofences, employee_work_locations, work_schedules,
  employee_schedules, employer_counters, work_sessions, punch_alerts, correction_requests,
  monthly_closings, incidents, integrations, integration_outbox, retention_policies,
  data_subject_requests
TO pontonexo_app;

-- DELETE só para feriados cadastrados pelo empregador
GRANT DELETE ON holidays TO pontonexo_app;

-- Referência fixa: a aplicação só lê
REVOKE INSERT ON roles FROM pontonexo_app;

-- ───────────── Imutabilidade ─────────────
CREATE OR REPLACE FUNCTION pn_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  purge_cols text[] := ARRAY['lat', 'lng', 'accuracy_m', 'coordinates_purged_at'];
BEGIN
  -- Única exceção: a política de retenção reduz coordenadas ao resultado (função pn_apply_retention).
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'punch_records'
     AND current_setting('pn.retention_purge', true) = 'on'
     AND NEW.lat IS NULL AND NEW.lng IS NULL AND NEW.accuracy_m IS NULL AND NEW.coordinates_purged_at IS NOT NULL
     AND (to_jsonb(NEW) - purge_cols) = (to_jsonb(OLD) - purge_cols) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Registro imutável: % em % não é permitido. Use o fluxo de tratamento.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER punch_records_immutable BEFORE UPDATE OR DELETE ON punch_records FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();
CREATE TRIGGER treatments_immutable BEFORE UPDATE OR DELETE ON treatments FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();
CREATE TRIGGER closing_acks_immutable BEFORE UPDATE OR DELETE ON closing_acknowledgements FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();
CREATE TRIGGER incident_updates_immutable BEFORE UPDATE OR DELETE ON incident_updates FOR EACH ROW EXECUTE FUNCTION pn_forbid_change();

CREATE OR REPLACE FUNCTION pn_forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE não é permitido em %', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER punch_records_no_truncate BEFORE TRUNCATE ON punch_records FOR EACH STATEMENT EXECUTE FUNCTION pn_forbid_truncate();
CREATE TRIGGER receipts_no_truncate BEFORE TRUNCATE ON receipts FOR EACH STATEMENT EXECUTE FUNCTION pn_forbid_truncate();
CREATE TRIGGER treatments_no_truncate BEFORE TRUNCATE ON treatments FOR EACH STATEMENT EXECUTE FUNCTION pn_forbid_truncate();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION pn_forbid_truncate();

-- Solicitação de correção: só sai de "pending" uma vez e só os campos de decisão mudam.
CREATE OR REPLACE FUNCTION pn_guard_correction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  decision_cols text[] := ARRAY['status', 'decided_by_user_id', 'decided_at', 'decision_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Solicitações de correção não podem ser apagadas' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já decidida (%)', OLD.status USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - decision_cols) <> (to_jsonb(OLD) - decision_cols) THEN
    RAISE EXCEPTION 'Só a decisão pode ser registrada numa solicitação' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'pending' THEN
    RAISE EXCEPTION 'Decisão inválida' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER correction_requests_guard BEFORE UPDATE OR DELETE ON correction_requests FOR EACH ROW EXECUTE FUNCTION pn_guard_correction();

-- Fechamento: só pode ser reaberto (uma vez), preservando a fotografia.
CREATE OR REPLACE FUNCTION pn_guard_closing() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  reopen_cols text[] := ARRAY['status', 'reopened_at', 'reopened_by_user_id', 'reopen_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fechamentos não podem ser apagados' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'closed' OR NEW.status <> 'reopened' OR (to_jsonb(NEW) - reopen_cols) <> (to_jsonb(OLD) - reopen_cols) THEN
    RAISE EXCEPTION 'Fechamento só pode ser reaberto, sem alterar a fotografia' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER monthly_closings_guard BEFORE UPDATE OR DELETE ON monthly_closings FOR EACH ROW EXECUTE FUNCTION pn_guard_closing();

-- ───────────── RLS por empregador ─────────────
CREATE OR REPLACE FUNCTION pn_current_employer() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.employer_id', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'job_roles', 'employees', 'employment_contracts', 'work_locations', 'geofences',
    'employee_work_locations', 'work_schedules', 'work_schedule_days', 'employee_schedules', 'holidays',
    'employer_counters', 'work_sessions', 'punch_records', 'receipts', 'punch_alerts',
    'correction_requests', 'treatments', 'monthly_closings', 'closing_acknowledgements',
    'integrations', 'integration_outbox', 'retention_policies', 'data_subject_requests',
    'privacy_acknowledgements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO pontonexo_app USING (employer_id = pn_current_employer()) WITH CHECK (employer_id = pn_current_employer())',
      t
    );
  END LOOP;
END $$;

ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employers TO pontonexo_app
  USING (id = pn_current_employer()) WITH CHECK (id = pn_current_employer());

-- Auditoria e incidentes: linhas do empregador no contexto dele; linhas da plataforma só sem contexto.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events TO pontonexo_app
  USING (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL))
  WITH CHECK (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL));
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incidents TO pontonexo_app
  USING (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL))
  WITH CHECK (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL));
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incident_updates TO pontonexo_app
  USING (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL))
  WITH CHECK (employer_id = pn_current_employer() OR (employer_id IS NULL AND pn_current_employer() IS NULL));

-- ───────────── Funções controladas (SECURITY DEFINER) ─────────────

-- Vínculos do usuário com nome do empregador (login e troca de empregador).
CREATE OR REPLACE FUNCTION pn_user_memberships(p_user uuid)
RETURNS TABLE (user_role_id uuid, employer_id uuid, employer_name text, role_code text, employee_id uuid, timezone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.id, ur.employer_id, e.display_name, ur.role_code, ur.employee_id, e.timezone
  FROM user_roles ur JOIN employers e ON e.id = ur.employer_id
  WHERE ur.user_id = p_user AND ur.active
  ORDER BY e.display_name
$$;

-- Verificação pública de comprovante pelo código.
CREATE OR REPLACE FUNCTION pn_receipt_by_code(p_code text)
RETURNS TABLE (code text, payload jsonb, hash text, signature text, key_id text, issued_at timestamptz, punch_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code, r.payload, r.hash, r.signature, r.key_id, r.issued_at, p.hash
  FROM receipts r JOIN punch_records p ON p.id = r.punch_record_id
  WHERE r.code = upper(p_code)
$$;

-- Lista de empregadores para tarefas agendadas (retenção, webhooks), que depois entram no contexto de cada um.
CREATE OR REPLACE FUNCTION pn_employer_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM employers ORDER BY created_at
$$;

-- Retenção: reduz coordenadas ao resultado após o prazo configurado pelo próprio empregador
-- (retention_policies, categoria punch_coordinates; padrão 395 dias). Retorna linhas afetadas.
CREATE OR REPLACE FUNCTION pn_apply_coordinate_retention(p_employer uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
  d integer;
BEGIN
  SELECT retention_days INTO d FROM retention_policies
   WHERE employer_id = p_employer AND category = 'punch_coordinates';
  d := greatest(coalesce(d, 395), 30);
  PERFORM set_config('pn.retention_purge', 'on', true);
  UPDATE punch_records
     SET lat = NULL, lng = NULL, accuracy_m = NULL, coordinates_purged_at = now()
   WHERE employer_id = p_employer
     AND coordinates_purged_at IS NULL
     AND (lat IS NOT NULL OR lng IS NOT NULL OR accuracy_m IS NOT NULL)
     AND server_time < now() - make_interval(days => d);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('pn.retention_purge', 'off', true);
  RETURN n;
END $$;

-- Sessões e tokens vencidos: dados de acesso (IP, navegador) não ficam além do prazo.
CREATE OR REPLACE FUNCTION pn_purge_access_data(p_session_days integer, p_reset_days integer)
RETURNS TABLE (sessions_deleted integer, tokens_deleted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s integer;
  r integer;
BEGIN
  DELETE FROM sessions WHERE coalesce(revoked_at, expires_at) < now() - make_interval(days => greatest(p_session_days, 30));
  GET DIAGNOSTICS s = ROW_COUNT;
  DELETE FROM password_reset_tokens WHERE expires_at < now() - make_interval(days => greatest(p_reset_days, 1));
  GET DIAGNOSTICS r = ROW_COUNT;
  RETURN QUERY SELECT s, r;
END $$;

REVOKE ALL ON FUNCTION pn_user_memberships(uuid), pn_receipt_by_code(text), pn_employer_ids(),
  pn_apply_coordinate_retention(uuid), pn_purge_access_data(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pn_user_memberships(uuid), pn_receipt_by_code(text), pn_employer_ids(),
  pn_apply_coordinate_retention(uuid), pn_purge_access_data(integer, integer), pn_current_employer()
  TO pontonexo_app;
