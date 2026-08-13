import { PrismaClient } from "@prisma/client";

/**
 * One shared PrismaClient for the whole app.
 *
 * In development Next.js hot-reloads modules on every edit. Without the global
 * cache below, each reload would construct another PrismaClient and open a new
 * connection pool, and after a dozen saves the database refuses new
 * connections. In production the module is only evaluated once, so the global
 * is skipped.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
