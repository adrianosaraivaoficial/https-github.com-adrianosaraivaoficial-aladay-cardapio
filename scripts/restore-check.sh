#!/bin/sh
set -eu
# Explicitly separate target URL prevents restoring over the source accidentally.
: "${RESTORE_DATABASE_URL:?Defina um banco vazio e descartável para o teste de restauração}"
: "${1:?Informe o arquivo .dump}"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$1"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) FROM tenants; SELECT COUNT(*) FROM orders; SELECT COUNT(*) FROM outbox_events;'
