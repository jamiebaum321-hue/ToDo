import { execFileSync } from "node:child_process";
import { TEST_DB_URL } from "./db-path";

/**
 * Reset the test database to the current schema before the suite runs.
 *
 * `db push --force-reset` drops and recreates everything, so each run starts
 * from a known-empty database no matter how the last one ended.
 */
export default function setup() {
  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
      stdio: "pipe",
    });
  } catch (err: any) {
    const detail = err?.stderr?.toString() ?? err?.stdout?.toString() ?? String(err);
    throw new Error(
      `Could not reach the test database at ${TEST_DB_URL.replace(/:[^:@/]*@/, ":***@")}.\n` +
        `Start one with \`docker compose up -d db\`, or set TEST_DATABASE_URL.\n\n${detail}`,
    );
  }
}
