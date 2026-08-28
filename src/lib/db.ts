import { PrismaClient } from "@prisma/client";
import { resolveRuntimeUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The URL is resolved rather than read straight from DATABASE_URL so a host
// that only sets POSTGRES_PRISMA_URL still works, and so the pooled connection
// carries the pgbouncer flag Prisma needs.
const datasourceUrl = resolveRuntimeUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
