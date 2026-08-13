import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Authentication — replaces what Supabase Auth used to do.
 *
 * Covers the "Registration, Login & SSO" common workflow: Google OAuth for
 * single sign-on, and email/password for everyone else.
 *
 * Session strategy is JWT rather than database sessions, because NextAuth's
 * Credentials provider cannot issue database sessions. The Prisma adapter is
 * still used, so Google sign-ins create real User and Account rows that the
 * rest of the schema can hold foreign keys against.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Ask Google for a refresh token so M3.4 (Tasks) and M3.6 (Calendar)
      // can act on the user's behalf later without a second consent screen.
      authorization: {
        params: { prompt: "consent", access_type: "offline", response_type: "code" },
      },
      allowDangerousEmailAccountLinking: true,
    }),

    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // No hash means the account was created through Google. Returning null
        // rather than an error keeps us from revealing which emails exist.
        if (!user?.passwordHash) return null;

        // A system administrator can suspend an account; that has to block
        // sign-in, not just hide the UI.
        if (user.status === "SUSPENDED") return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in, stamp the id onto the token.
      if (user) token.id = user.id;

      // Role is re-read from the database on sign-in and whenever the client
      // calls update() — so an admin demoting someone takes effect without
      // waiting for their token to expire.
      if (user || trigger === "update") {
        const id = (user?.id ?? token.id) as string | undefined;
        if (id) {
          const fresh = await prisma.user.findUnique({
            where: { id },
            select: { role: true, name: true },
          });
          if (fresh) {
            token.role = fresh.role;
            token.name = fresh.name;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.role = (token.role as UserRole) ?? "RESIDENT";
      return session;
    },
  },

  events: {
    /**
     * Google hands us a verified email but nothing else we care about. New
     * OAuth users land as RESIDENT (the schema default); this just makes sure
     * a display name is present, since the UI falls back to the raw email.
     */
    async createUser({ user }) {
      if (!user.name && user.email) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { name: user.email.split("@")[0] },
        });
      }
    },
  },
});
