// YouTube Data API v3 integration. SERVER-ONLY.
// OAuth refresh token lives in app_credentials (key "youtube").
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";

import { db, tables } from "@/db";
import type { Json } from "@/db/schema";

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID/SECRET 미설정");
  return { id, secret };
}

export function youtubeRedirectUri(): string {
  const base =
    process.env.BETTER_AUTH_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:8080");
  return `${base}/api/youtube/callback`;
}

export function youtubeConsentUrl(state: string): string {
  const { id } = clientCreds();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeYouTubeCode(code: string): Promise<void> {
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: youtubeRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as { refresh_token?: string; error?: string };
  if (!res.ok || !data.refresh_token) {
    throw new Error(`YouTube 토큰 교환 실패: ${data.error ?? res.status}`);
  }
  const value = { refresh_token: data.refresh_token } as unknown as Json;
  await db
    .insert(tables.app_credentials)
    .values({ key: "youtube", value })
    .onConflictDoUpdate({
      target: tables.app_credentials.key,
      set: { value, updated_at: new Date().toISOString() },
    });
}

export async function youtubeConnected(): Promise<boolean> {
  const rows = await db
    .select({ key: tables.app_credentials.key })
    .from(tables.app_credentials)
    .where(eq(tables.app_credentials.key, "youtube"))
    .limit(1);
  return rows.length > 0;
}

async function accessToken(): Promise<string> {
  const rows = await db
    .select()
    .from(tables.app_credentials)
    .where(eq(tables.app_credentials.key, "youtube"))
    .limit(1);
  const refresh = (rows[0]?.value as { refresh_token?: string } | undefined)
    ?.refresh_token;
  if (!refresh) {
    throw new Error("YouTube 계정이 연결되지 않았습니다. 스튜디오에서 먼저 연결해주세요.");
  }
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`YouTube 토큰 갱신 실패: ${data.error ?? res.status} — 재연결이 필요할 수 있어요.`);
  }
  return data.access_token;
}

export async function uploadToYouTube(args: {
  filePath: string;
  thumbnailPath?: string;
  title: string;
  description: string;
  tags: string[];
  privacy: "private" | "unlisted" | "public";
}): Promise<string> {
  const token = await accessToken();
  const file = await readFile(args.filePath);

  // 1) Start resumable session
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(file.length),
      },
      body: JSON.stringify({
        snippet: {
          title: args.title.slice(0, 100),
          description: args.description.slice(0, 4900),
          tags: args.tags.slice(0, 15),
          categoryId: "27", // Education
          defaultLanguage: "ko",
        },
        status: {
          privacyStatus: args.privacy,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  if (!init.ok) {
    const t = await init.text().catch(() => "");
    throw new Error(`YouTube 업로드 시작 실패 (${init.status}): ${t.slice(0, 300)}`);
  }
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube 업로드 세션 URL이 없습니다.");

  // 2) Upload bytes
  const up = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(file.length),
    },
    body: new Uint8Array(file),
  });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(`YouTube 업로드 실패 (${up.status}): ${t.slice(0, 300)}`);
  }
  const video = (await up.json()) as { id?: string };
  if (!video.id) throw new Error("YouTube가 영상 ID를 반환하지 않았습니다.");

  // 3) Custom thumbnail (requires phone-verified channel — non-fatal if denied)
  if (args.thumbnailPath) {
    try {
      const thumb = await readFile(args.thumbnailPath);
      await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "image/jpeg",
          },
          body: new Uint8Array(thumb),
        },
      );
    } catch (e) {
      console.warn("[youtube] thumbnail set failed (non-fatal):", e);
    }
  }
  return video.id;
}
