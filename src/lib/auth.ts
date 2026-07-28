import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import { findUserByEmail, updateUser } from "@/repositories/user";
import { isSignInAllowed } from "@/lib/authAllowlist";

interface GitHubProfile {
  name?: string;
  login?: string;
  avatar_url?: string;
  emailVerified?: Date | null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  adapter: PrismaAdapter(prisma),
  callbacks: {
    async signIn({ user, account: _account, profile }) {
      // Membership gate. Until this existed, a successful OAuth login was the
      // only requirement to get an account, so "invite-only" was a description
      // of intent rather than something the app enforced. Existing users are
      // always admitted; new addresses must match AUTH_ALLOWED_EMAILS.
      // See src/lib/authAllowlist.ts.
      const existing = user.email ? await findUserByEmail(user.email) : null;

      if (existing?.disabled) return false;

      if (!isSignInAllowed(user.email, !!existing)) {
        console.warn(
          `[auth] refused sign-in for ${user.email ?? "unknown address"}: ` +
            `not an existing user and not in AUTH_ALLOWED_EMAILS`,
        );
        return false;
      }

      if ((user as { emailVerified?: Date | null })?.emailVerified) return true;
      const unverifiedUser = existing;
      if (!unverifiedUser) return true;
      if (unverifiedUser.emailVerified) return true;
      // For GitHub, profile may have different fields
      const githubProfile = profile as GitHubProfile;
      const now = new Date();
      await updateUser(unverifiedUser.id, {
        name: githubProfile.name || githubProfile.login,
        image: githubProfile.avatar_url,
        emailVerified: now,
        updatedAt: now,
      });
      return true;
    },
    async session({ session, token: _token }) {
      if (session.user) {
        const user = await findUserByEmail(session.user.email);
        if (!user) return session;
        session.user = await updateUser(user.id, {
          emailVerified: user.emailVerified || user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: new Date(),
        });
      }
      return session;
    },
  },
};
