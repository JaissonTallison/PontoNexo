#!/usr/bin/env bash
# Restaura um backup cifrado num banco NOVO (nunca sobrescreve um existente).
# Uso: scripts/restaurar.sh <arquivo.dump.enc> <banco_destino>
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
FILE="$1"; TARGET="$2"; U="${POSTGRES_USER:-pontonexo}"
sha256sum -c "$FILE.sha256"
if docker compose exec -T postgres psql -U "$U" -d postgres -tAc "select 1 from pg_database where datname='$TARGET'" | grep -q 1; then
  echo "Banco $TARGET já existe; escolha outro nome." >&2; exit 1
fi
docker compose exec -T postgres createdb -U "$U" "$TARGET"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | docker compose exec -T postgres pg_restore -U "$U" -d "$TARGET" --no-owner --exit-on-error
echo "Restaurado em $TARGET"
