/**
 * The test database.
 *
 * Integration tests run against a real PostgreSQL, the same engine production
 * uses — the things worth testing here (the unique constraint on
 * (userId, sourceKey), cascading deletes, the replace-the-window query) are
 * database behaviour, and SQLite would only prove SQLite.
 *
 * Point TEST_DATABASE_URL at any throwaway database:
 *   docker compose up -d db     # or any local Postgres
 *   export TEST_DATABASE_URL="postgresql://todo:todo@localhost:5432/todo_test"
 */
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://todo:todo@localhost:5432/todo_test";
