import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    globalSetup: [],
    include: ["tests/{buckets,csp,db-url,deeplinks,delegate,mail-links,time,validation,drafts}.test.ts"],
  },
});
