/**
 * Build entrypoint.
 *
 * Resolves whatever connection strings the host injected into the two names
 * Prisma's schema expects, applies pending migrations, then builds. Running
 * migrations here means a deploy brings its own database up to date instead of
 * failing at the first query.
 *
 * Set SKIP_MIGRATE=1 to build without migrating — CI does, having already run
 * the migration as its own step, and the Docker image migrates on boot instead.
 */
import { spawnSync } from "node:child_process";
import { describeResolution, resolveDirectUrl, resolveRuntimeUrl } from "../src/lib/db-url";

const runtimeUrl = resolveRuntimeUrl();
const directUrl = resolveDirectUrl();
const from = describeResolution();

if (!runtimeUrl) {
  console.error(
    [
      "",
      "No database connection string found.",
      "",
      "Set DATABASE_URL, or connect a Postgres store so the host injects one of:",
      "  DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL, DATABASE_URL_UNPOOLED",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Names only — a connection string carries the password.
console.log(`→ database: pooled from ${from.runtime}, direct from ${from.direct}`);

const env = { ...process.env, DATABASE_URL: runtimeUrl, DIRECT_URL: directUrl ?? runtimeUrl };

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "generate"]);
if (process.env.SKIP_MIGRATE !== "1") run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["next", "build"]);
