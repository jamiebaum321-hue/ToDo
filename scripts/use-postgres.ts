/**
 * Switch the Prisma datasource from SQLite to PostgreSQL.
 *
 *   npm run db:use-postgres
 *   export DATABASE_URL="postgresql://user:pass@host:5432/todo"
 *   npx prisma migrate dev --name init
 *
 * The schema is written to be provider-agnostic — no enums, no Json columns —
 * so this really is a one-line change and a migration.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), "prisma/schema.prisma");
const schema = readFileSync(path, "utf8");

if (schema.includes('provider = "postgresql"')) {
  console.log("Already on PostgreSQL — nothing to do.");
  process.exit(0);
}

const next = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
if (next === schema) {
  console.error("Could not find the sqlite provider line in prisma/schema.prisma.");
  process.exit(1);
}

writeFileSync(path, next);
console.log(`Switched prisma/schema.prisma to PostgreSQL.

Next:
  1. export DATABASE_URL="postgresql://user:pass@host:5432/todo"
  2. npx prisma migrate dev --name init
  3. npm run build

Your existing SQLite data is not migrated — this is a fresh database.`);
