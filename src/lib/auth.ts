import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import { findUserByEmail, updateUser } from "@/repositories/user";

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
    async signIn({ user, account, profile }) {
      if ((user as any)?.emailVerified) return true;
      const unverifiedUser = await findUserByEmail(user.email!);
      if (!unverifiedUser) return true;
      if (unverifiedUser.emailVerified) return true;
      // For GitHub, profile may have different fields
      const githubProfile = profile as any;
      const now = new Date();
      await updateUser(unverifiedUser.id, {
        name: githubProfile.name || githubProfile.login,
        image: githubProfile.avatar_url,
        emailVerified: now,
        updatedAt: now,
      });
      return true;
    },
    async session({ session, token }) {
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
