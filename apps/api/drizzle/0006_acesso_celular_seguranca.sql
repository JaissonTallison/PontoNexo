-- Permissões, RLS e função controlada para acesso pelo celular, passkeys e notificações.
GRANT SELECT, INSERT, UPDATE ON login_codes, webauthn_credentials, webauthn_challenges, push_subscriptions TO pontonexo_app;
GRANT DELETE ON webauthn_credentials, push_subscriptions TO pontonexo_app;
GRANT SELECT, INSERT ON reminders_sent, correction_reads TO pontonexo_app;

ALTER TABLE reminders_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reminders_sent TO pontonexo_app
  USING (employer_id = pn_current_employer()) WITH CHECK (employer_id = pn_current_employer());
ALTER TABLE correction_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON correction_reads TO pontonexo_app
  USING (employer_id = pn_current_employer()) WITH CHECK (employer_id = pn_current_employer());

-- Usuários com acesso ativo de funcionário cujo celular cadastrado termina com os dígitos informados
-- (compara os últimos 11 dígitos: DDD + número). Usado só pelo login por código.
CREATE OR REPLACE FUNCTION pn_users_by_phone(p_digits text)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ur.user_id
  FROM employees e
  JOIN user_roles ur ON ur.employee_id = e.id AND ur.active
  JOIN users u ON u.id = ur.user_id AND u.status = 'active'
  WHERE e.status = 'active'
    AND length(p_digits) >= 10
    AND right(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), 11) = right(p_digits, 11)
$$;
REVOKE ALL ON FUNCTION pn_users_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pn_users_by_phone(text) TO pontonexo_app;
