import { resolve } from "node:path";

/** One definition of the test database, shared by the config and the setup. */
export const TEST_DB_FILE = resolve(process.cwd(), "tests/.tmp/test.db");
export const TEST_DB_URL = `file:${TEST_DB_FILE}`;
