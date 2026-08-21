import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import type { PrismaClient, UserRole } from "@prisma/client";

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

/**
 * Stops a development AUTH_URL from breaking the deployed site.
 *
 * `.env` carries AUTH_URL=http://localhost:3000 for local work. If that value
 * is ever copied into Vercel's environment variables — which is the obvious
 * thing to do when setting a project up, and what `vercel env pull` round-trips
 * — NextAuth builds every OAuth callback against localhost. Sign-in then sends
 * the user's browser to their own machine and the whole flow dies with no
 * server-side error to find.
 *
 * `trustHost: true` below means NextAuth derives the origin from the incoming
 * request when AUTH_URL is absent, which is always correct on Vercel. So on a
 * Vercel host we drop a localhost AUTH_URL rather than honour it.
 */
if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(process.env.AUTH_URL ?? "")) {
  console.warn("[auth] Ignoring localhost AUTH_URL in a Vercel deployment; using the request host.");
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The cast is a type-level formality: our client is configured to omit
  // `user.passwordHash` globally (see lib/prisma.ts), which narrows its type
  // away from the plain PrismaClient the adapter's signature asks for. The
  // adapter only ever touches User, Account and Session for OAuth sign-ins,
  // and an OAuth user has no password hash to read, so nothing it does depends
  // on the omitted column.
  adapter: PrismaAdapter(prisma as unknown as PrismaClient),
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

        // The only read in the app that opts back into the password hash —
        // lib/prisma.ts omits it globally so it cannot leak by accident.
        const user = await prisma.user.findUnique({
          where: { email },
          omit: { passwordHash: false },
        });

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
    /**
     * Closes the account pre-hijacking hole that `allowDangerousEmailAccountLinking`
     * opens above.
     *
     * ── THE ATTACK ──────────────────────────────────────────────────────────
     * /api/auth/register does not prove the registrant owns the address — no
     * confirmation email is sent anywhere in this project, and `emailVerified`
     * is never written. So an attacker can register victim@gmail.com with a
     * password of their choosing. When the real owner later clicks "Continue
     * with Google", automatic linking would attach their Google identity to the
     * attacker's existing row, and the attacker's password would still open it.
     * The victim never sees anything wrong.
     * ────────────────────────────────────────────────────────────────────────
     *
     * The rule: Google may link into an existing account only when that account
     * cannot have been planted. An account with no password (created by Google
     * in the first place) is safe, and so is one whose address has actually
     * been verified. A password account with an unverified address is not, so
     * that one link is refused and the person is asked to sign in with the
     * password they already have.
     *
     * Linking is still automatic in every safe case, which is the whole point
     * of SSO — this only blocks the shape the attack needs.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      const email = user.email?.toLowerCase().trim();
      if (!email) return "/login?error=NoEmailFromGoogle";

      const existing = await prisma.user.findUnique({
        where: { email },
        omit: { passwordHash: false },
      });

      // No account yet: the adapter is about to create one. Nothing to hijack.
      if (!existing) return true;

      // Suspension has to bite on the SSO path too, or an admin's suspension is
      // one button click away from being bypassed.
      if (existing.status === "SUSPENDED") return "/login?error=AccountSuspended";

      // Already linked — this is simply a returning Google user.
      const linked = await prisma.account.findFirst({
        where: { userId: existing.id, provider: "google" },
        select: { id: true },
      });
      if (linked) return true;

      if (existing.passwordHash && !existing.emailVerified) {
        return "/login?error=PasswordAccountExists";
      }

      return true;
    },

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

    /**
     * Google only releases an address it has verified, so a successful link is
     * proof of ownership. Recording it matters beyond bookkeeping: the signIn
     * callback treats `emailVerified` as the signal that an account is safe to
     * link into, so without this a user who links Google would be re-challenged
     * on every subsequent sign-in.
     */
    async linkAccount({ user, account }) {
      if (account.provider !== "google") return;
      await prisma.user.update({
        where: { id: user.id! },
        data: { emailVerified: new Date() },
      });
    },
  },
});
