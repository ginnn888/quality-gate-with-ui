import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// GitHub is the ONLY way into this app. There is no credentials provider, no
// email magic link, no anonymous mode — the whole product is scoped to the
// repositories of the signed-in GitHub account, so the OAuth token IS the
// session.
//
// The `repo` scope is what lets the console list and read a user's private
// repositories; without it GitHub only returns public ones.
const SCOPES = "read:user user:email repo";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      id?: string;
      login?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID || process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET || process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Persist the GitHub OAuth token + login on the JWT: every repository call
    // this app makes is performed as the signed-in user, never with a shared
    // server token.
    async jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (profile) {
        token.login = (profile as any).login;
        token.githubId = String((profile as any).id ?? "");
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.user.login = token.login as string | undefined;
      if (token.githubId) session.user.id = token.githubId as string;
      return session;
    },
  },
});
