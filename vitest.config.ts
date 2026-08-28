import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { TEST_DB_URL } from "./tests/db-path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    globalSetup: ["./tests/global-setup.ts"],
    // A single worker: every test shares one SQLite file, and parallel writes
    // to it would trip over each other rather than reveal anything real.
    fileParallelism: false,
    env: { DATABASE_URL: TEST_DB_URL },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
