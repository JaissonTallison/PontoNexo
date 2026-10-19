#!/bin/sh
# Executado só na criação do volume. Cria o papel de aplicação (sem posse de tabelas)
# e o banco de testes. As permissões finas ficam nas migrações.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
    CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END \$\$;
CREATE DATABASE pontonexo_test OWNER $POSTGRES_USER;
GRANT CONNECT ON DATABASE $POSTGRES_DB TO ${APP_DB_USER};
GRANT CONNECT ON DATABASE pontonexo_test TO ${APP_DB_USER};
SQL
