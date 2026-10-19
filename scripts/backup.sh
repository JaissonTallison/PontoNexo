#!/usr/bin/env bash
# Backup cifrado do PostgreSQL (pg_dump formato custom + AES-256 via OpenSSL, chave em BACKUP_PASSPHRASE).
# Uso: scripts/backup.sh            (usa DATABASE_OWNER_URL do .env; roda pg_dump dentro do container)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE (pnpm chaves:gerar)}"
DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR"; chmod 700 "$DIR"
DB="${1:-pontonexo}"
OUT="$DIR/pontonexo-${DB}-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-pontonexo}" -d "$DB" -Fc --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
chmod 600 "$OUT" "$OUT.sha256"
echo "$OUT"
