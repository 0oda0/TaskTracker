#!/bin/bash
# Consistent SQLite snapshot of the running container's DB, kept locally on
# the VPS (see docs in README). Run from cron on the host, not in Docker.
set -euo pipefail

CONTAINER=tasktracker-app-1
DEST=/opt/tasktracker-backups
TS=$(date +%F_%H%M%S)

mkdir -p "$DEST"

# VACUUM INTO takes an atomic, consistent snapshot even while the app is
# writing - a plain file copy of a live SQLite db risks grabbing it mid-write.
docker exec "$CONTAINER" node -e "require('/app/src/db').exec(\"VACUUM INTO '/data/backup-tmp.db'\")"
docker cp "$CONTAINER:/data/backup-tmp.db" "$DEST/tasktracker-$TS.db"
docker exec "$CONTAINER" rm -f /data/backup-tmp.db

# Keep 14 days of daily backups, same retention as HSKLearn's.
find "$DEST" -name 'tasktracker-*.db' -mtime +14 -delete

echo "Backed up to $DEST/tasktracker-$TS.db"
