#!/bin/sh
set -eu
umask 077
mkdir -p /backups
backup_name="aladay-$(date -u +%Y%m%dT%H%M%SZ).dump"
partial_path="/backups/$backup_name.partial"
trap 'rm -f "$partial_path"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$partial_path"
pg_restore --list "$partial_path" >/dev/null
mv "$partial_path" "/backups/$backup_name"
sha256sum "/backups/$backup_name" > "/backups/$backup_name.sha256"
find /backups -type f -name 'aladay-*.dump*' -mtime "+${BACKUP_RETENTION_DAYS:-7}" -delete
printf '%s\n' "Backup concluído: $backup_name"
