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

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    /**
     * The bcrypt hash is excluded from every query in the application by
     * default.
     *
     * Not belt-and-braces — this closes a hole that was real. A `user.update()`
     * written without an explicit `select` returns every column, and the
     * profile route did exactly that, sending the hash back to the browser on
     * every profile save. Relying on each author of each future query to
     * remember `omit` is exactly the rule that gets forgotten silently: the
     * data leaks, nothing errors, nothing looks wrong.
     *
     * The one read that legitimately needs the hash — the credentials provider
     * comparing a password in auth.ts — opts back in with
     * `omit: { passwordHash: false }`, which makes it easy to find and review.
     */
    omit: { user: { passwordHash: true } },
  });
}

/** The client's type carries the `omit` above, so it is derived rather than
 * written as a bare PrismaClient — otherwise the cached instance would widen
 * back to a type that claims `passwordHash` is always present. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
