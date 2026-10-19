-- Corrige pn_forbid_change: PL/pgSQL não garante curto-circuito no AND, então NEW.lat
-- era avaliado em tabelas sem essa coluna. A exceção de retenção agora fica em IF aninhado.
CREATE OR REPLACE FUNCTION pn_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  purge_cols text[] := ARRAY['lat', 'lng', 'accuracy_m', 'coordinates_purged_at'];
  n jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'punch_records' THEN
    IF current_setting('pn.retention_purge', true) = 'on' THEN
      n := to_jsonb(NEW);
      IF n->'lat' = 'null'::jsonb AND n->'lng' = 'null'::jsonb AND n->'accuracy_m' = 'null'::jsonb
         AND n->'coordinates_purged_at' <> 'null'::jsonb
         AND (n - purge_cols) = (to_jsonb(OLD) - purge_cols) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'Registro imutável: % em % não é permitido. Use o fluxo de tratamento.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;
