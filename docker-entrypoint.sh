#!/bin/sh
set -e

# Bring the schema up to date on every boot. `db push` is idempotent, so this is
# safe to run repeatedly and means a fresh volume just works.
echo "→ syncing database schema"
npx prisma db push --skip-generate --accept-data-loss

if [ "${RUN_WORKER:-true}" = "true" ]; then
  echo "→ starting the scheduler"
  npx tsx scripts/worker.ts &
fi

echo "→ starting ToDo on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
