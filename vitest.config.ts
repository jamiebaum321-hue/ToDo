import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { TEST_DB_URL } from "./tests/db-path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    globalSetup: ["./tests/global-setup.ts"],
    // A single worker: every test file shares one database and truncates
    // between cases, so running them in parallel would have them delete each
    // other's fixtures rather than reveal anything real.
    fileParallelism: false,
    env: { DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
