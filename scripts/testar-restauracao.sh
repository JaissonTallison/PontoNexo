#!/usr/bin/env bash
# Teste de recuperação: faz backup, restaura em banco temporário, compara contagens e confere a cadeia de hash.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
U="${POSTGRES_USER:-pontonexo}"; TMP="pontonexo_restore_$(date +%s)"
FILE=$(scripts/backup.sh pontonexo | tail -1)
scripts/restaurar.sh "$FILE" "$TMP"
q() { docker compose exec -T postgres psql -U "$U" -d "$1" -tAc "$2"; }
ok=1
for t in punch_records receipts treatments audit_events correction_requests employees; do
  a=$(q pontonexo "select count(*) from $t"); b=$(q "$TMP" "select count(*) from $t")
  printf '%-22s origem=%s restaurado=%s\n' "$t" "$a" "$b"; [ "$a" = "$b" ] || ok=0
done
# cadeia de marcações: cada prev_hash aponta para o hash do NSR anterior do mesmo empregador
broken=$(q "$TMP" "select count(*) from punch_records p join punch_records q on q.employer_id=p.employer_id and q.nsr=p.nsr-1 where p.prev_hash<>q.hash")
echo "elos de hash quebrados: $broken"; [ "$broken" = "0" ] || ok=0
docker compose exec -T postgres dropdb -U "$U" "$TMP"
[ $ok = 1 ] && echo "RESTAURAÇÃO OK" || { echo "RESTAURAÇÃO FALHOU"; exit 1; }
