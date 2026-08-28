import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { TEST_DB_FILE, TEST_DB_URL } from "./db-path";

/**
 * Integration tests run against a real SQLite file rather than a mock, because
 * the parts worth testing here — the unique constraint on (userId, sourceKey),
 * cascading deletes, the replace-the-window query — are database behaviour.
 */
export default function setup() {
  rmSync(TEST_DB_FILE, { force: true });
  rmSync(`${TEST_DB_FILE}-journal`, { force: true });
  mkdirSync(dirname(TEST_DB_FILE), { recursive: true });

  // No --force-reset: the file was just deleted, so `db push` creates it clean.
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
}
