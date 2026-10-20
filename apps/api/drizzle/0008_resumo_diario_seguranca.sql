GRANT SELECT, INSERT ON daily_summaries_sent TO pontonexo_app;
ALTER TABLE daily_summaries_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daily_summaries_sent TO pontonexo_app
  USING (employer_id = pn_current_employer()) WITH CHECK (employer_id = pn_current_employer());
