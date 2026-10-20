-- Funções comuns do trabalho doméstico para as contas criadas antes de o cadastro já trazê-las.
-- Não duplica: só insere o nome que a conta ainda não tem (mesma regra do índice job_roles_name_uq).
INSERT INTO job_roles (employer_id, name)
SELECT e.id, f.name
FROM employers e
CROSS JOIN (VALUES
  ('Empregado(a) doméstico(a)'),
  ('Cozinheiro(a)'),
  ('Babá'),
  ('Cuidador(a) de idosos'),
  ('Caseiro(a)'),
  ('Jardineiro(a)'),
  ('Motorista particular'),
  ('Governanta'),
  ('Arrumador(a)'),
  ('Lavador(a) e passador(a)')
) AS f(name)
WHERE NOT EXISTS (
  SELECT 1 FROM job_roles j WHERE j.employer_id = e.id AND lower(j.name) = lower(f.name)
);
