#!/bin/sh
set -e

# Migrations are idempotent, so a fresh volume and an upgrade both just work.
echo "→ applying database migrations"
npx prisma migrate deploy

if [ "${RUN_WORKER:-true}" = "true" ]; then
  echo "→ starting the scheduler"
  npx tsx scripts/worker.ts &
fi

echo "→ starting ToDo on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
