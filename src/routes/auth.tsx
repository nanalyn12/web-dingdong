import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { USERNAME_RE, usernameToEmail } from "@/lib/local-account";
import { ensureProfile } from "@/lib/profile.functions";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "로그인 — DingDong" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const ensure = useServerFn(ensureProfile);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function afterSignedIn() {
    try {
      const { needsOnboarding } = await ensure({});
      const dest = needsOnboarding ? "/onboarding" : (search.redirect ?? "/");
      navigate({ to: dest });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "프로필 동기화 실패");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!USERNAME_RE.test(username)) {
      toast.error("아이디는 영문/숫자/._- 3~30자로 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const uname = username.trim().toLowerCase();
      if (mode === "login") {
        const { error } = await authClient.signIn.username({
          username: uname,
          password,
        });
        if (error) throw new Error(error.message || "로그인 실패");
        toast.success("환영합니다!");
        await afterSignedIn();
      } else {
        const { error } = await authClient.signUp.email({
          name: uname,
          username: uname,
          email: usernameToEmail(uname),
          password,
        });
        if (error) throw new Error(error.message || "회원가입 실패");
        toast.success("가입 완료!");
        await afterSignedIn();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setGoogleLoading(true);
    try {
      // Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on the server.
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: search.redirect ?? "/",
      });
      if (error) {
        toast.error(error.message || "Google 로그인 실패");
      }
      // On success the browser redirects to Google; nothing further here.
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md glass rounded-4xl p-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="size-9 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <span className="font-bold text-lg">DingDong</span>
        </Link>

        <h1 className="mt-6 text-2xl font-bold">
          {mode === "login" ? "다시 오신 걸 환영해요" : "DingDong 시작하기"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "login"
            ? "아이디 또는 Google로 로그인하세요."
            : "아이디 또는 Google로 계정을 만드세요."}
        </p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={googleLoading}
          className="mt-6 w-full rounded-2xl bg-white/80 border border-border py-3 font-medium flex items-center justify-center gap-3 hover:bg-white transition disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "연결 중…" : "Google로 계속하기"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          또는 아이디
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground">아이디</label>
          <input
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-2xl bg-white/60 border border-border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="예: admin"
          />
          <label className="text-xs font-medium text-muted-foreground mt-2">비밀번호</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl bg-white/60 border border-border px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
          <button
            disabled={loading}
            className="mt-3 rounded-2xl gradient-primary text-primary-foreground py-3 font-semibold shadow-[var(--shadow-soft)] disabled:opacity-60"
          >
            {loading ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.3 0-13.6 4.1-16.7 10.2z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-4.9c-1.9 1.3-4.3 2-6.9 2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.7 39.4 16.3 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.4 5.6l6 4.9c-.4.4 6.6-4.8 6.6-14.5 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
