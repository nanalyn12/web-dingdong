// Server-only better-auth instance. Import lazily inside server handlers:
// const { auth } = await import("@/lib/auth.server");
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { isValidLocalSignup } from "@/lib/local-account";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:8080"),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // The app signs up with synthetic <username>@dingdong.local addresses;
    // there is no mail server, so nothing to verify.
    requireEmailVerification: false,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  hooks: {
    // The sign-up form builds the address from the 아이디, but /api/auth is the
    // full better-auth handler — anyone can POST /sign-up/email directly with an
    // address of their choosing. Since requireEmailVerification is off, that
    // would let a stranger register an ADMIN_EMAILS/TEACHER_EMAILS address and
    // be promoted by ensureProfile. Pin the address to the username server-side.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const body = (ctx.body ?? {}) as { email?: unknown; username?: unknown };
      const uname = typeof body.username === "string" ? body.username : "";
      const email = typeof body.email === "string" ? body.email : "";
      if (!isValidLocalSignup(uname, email)) {
        throw new APIError("BAD_REQUEST", {
          message:
            "아이디는 영문/숫자/._- 3~30자여야 하고, 이메일 주소는 직접 정할 수 없어요. 실제 이메일로 가입하려면 Google 로그인을 이용해 주세요.",
        });
      }
    }),
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
