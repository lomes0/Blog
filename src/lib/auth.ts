import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { findUserByEmail, updateUser } from "@/repositories/user";

interface OAuthProfile {
  name?: string;
  login?: string;
  avatar_url?: string;
  picture?: string;
  emailVerified?: Date | null;
}

/**
 * The OAuth providers this deployment can actually use.
 *
 * Registered from whichever credentials are present rather than hardcoded, so
 * the set is a fact about the environment. The login UI reads the same list
 * back through `/api/auth/providers` (see `useAuthProviders`) instead of naming
 * a provider itself — previously the buttons called `signIn("google")` while
 * only GitHub was registered, so clicking them could never complete a sign-in.
 *
 * `allowDangerousEmailAccountLinking` is set so someone who signs in with
 * GitHub and later with Google on the same verified address lands on one
 * account rather than hitting OAuthAccountNotLinked. Both providers here verify
 * email ownership themselves, which is the condition that makes it safe.
 */
// `next-auth/providers` is not in the package's exports map, so the element
// type is derived from the options object rather than deep-imported.
type Provider = NextAuthOptions["providers"][number];

function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
        // `User.name` is NOT NULL, and Google's default mapping passes
        // `profile.name` straight through — an account without one would fail
        // the very first insert. GitHub's mapping already falls back to
        // `login`; this gives Google the equivalent.
        profile: (profile) => ({
          id: profile.sub,
          name: profile.name || profile.email?.split("@")[0] || "New user",
          email: profile.email,
          image: profile.picture,
        }),
      }),
    );
  }

  if (providers.length === 0) {
    console.error(
      "[auth] No OAuth provider is configured — sign-in will not work. " +
        "Set GITHUB_CLIENT_ID/SECRET or GOOGLE_CLIENT_ID/SECRET.",
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),
  adapter: PrismaAdapter(prisma),
  callbacks: {
    async signIn({ user, account: _account, profile }) {
      // Registration is open — access is managed by who gets told the URL. The
      // only refusal here is an account an admin has disabled, which would
      // otherwise sign in successfully and be rejected route by route.
      const existing = user.email ? await findUserByEmail(user.email) : null;
      if (existing?.disabled) return false;

      // Sign-in is the moment worth recording, so `lastLogin` is stamped here.
      // It used to be written in the `session` callback, which NextAuth runs on
      // every `getServerSession` — one UPDATE per authenticated request, and a
      // `updatedAt` that churned constantly as a result.
      if (existing) {
        const oauth = (profile ?? {}) as OAuthProfile;
        const now = new Date();
        await updateUser(existing.id, {
          // Backfill a display name/avatar only when the row is missing one, so
          // a later sign-in never clobbers what the user has since set.
          ...(existing.name ? {} : { name: oauth.name || oauth.login }),
          ...(existing.image
            ? {}
            : { image: oauth.avatar_url ?? oauth.picture }),
          // Both providers verify the address themselves before returning it.
          emailVerified: existing.emailVerified ?? now,
          lastLogin: now,
          updatedAt: now,
        });
      }
      return true;
    },
    async session({ session, token: _token }) {
      // Hydrate the session from the database so `id`, `role` and `disabled`
      // are present on `session.user` — the API routes authorize off these.
      // Read-only: see the note on `lastLogin` above.
      if (!session.user?.email) return session;
      const user = await findUserByEmail(session.user.email);
      if (!user) return session;
      session.user = user;
      return session;
    },
  },
};
