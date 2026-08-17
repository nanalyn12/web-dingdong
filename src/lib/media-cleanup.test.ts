import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isOrphanMediaFile, orphanFilesIn } from "./media-cleanup";

const A = "11111111-2222-3333-4444-555555555555";
const B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// ── L1-4 ~ L1-8: 무엇을 지울지 판정 ────────────────────────────────────────
//
// 이 판정이 틀리면 실제 사용자 미디어가 사라진다. 경계 사례를 못으로 박아 둔다.

describe("isOrphanMediaFile", () => {
  const live = new Set([A]);

  it("살아 있는 id의 mp4는 지우지 않는다", () => {
    expect(isOrphanMediaFile(`${A}.mp4`, live)).toBe(false);
  });

  it("살아 있는 id의 썸네일은 지우지 않는다", () => {
    expect(isOrphanMediaFile(`${A}-thumb.jpg`, live)).toBe(false);
  });

  it("살아 있는 id 목록에 없으면 고아다", () => {
    expect(isOrphanMediaFile(`${B}.mp4`, live)).toBe(true);
    expect(isOrphanMediaFile(`${B}-thumb.jpg`, live)).toBe(true);
  });

  it("uuid 대소문자가 달라도 같은 id로 본다", () => {
    expect(isOrphanMediaFile(`${A.toUpperCase()}.mp4`, live)).toBe(false);
    expect(isOrphanMediaFile(`${A}.mp4`, new Set([A.toUpperCase()]))).toBe(false);
  });

  it("이름 형식이 맞지 않는 파일은 절대 지우지 않는다", () => {
    for (const name of [
      ".gitkeep",
      "readme.txt",
      "notauuid.mp4",
      "final-render.mp4",
      `${A}.txt`, // uuid지만 관리 대상 확장자가 아님
      `${A}.mp4.bak`,
      `prefix-${A}.mp4`,
      `${A}-thumb.png`,
      "",
    ]) {
      expect(isOrphanMediaFile(name, new Set()), name).toBe(false);
    }
  });

  it("살아 있는 id가 하나도 없어도 형식이 맞는 것만 고아가 된다", () => {
    expect(isOrphanMediaFile(`${A}.mp4`, new Set())).toBe(true);
    expect(isOrphanMediaFile("something.mp4", new Set())).toBe(false);
  });
});

describe("orphanFilesIn", () => {
  it("고아 파일만 골라낸다", () => {
    const files = [`${A}.mp4`, `${A}-thumb.jpg`, `${B}.mp4`, ".gitkeep", "notes.md"];
    expect(orphanFilesIn(files, [A])).toEqual([`${B}.mp4`]);
  });

  it("살아 있는 id가 없으면 형식이 맞는 파일이 전부 고아다", () => {
    expect(orphanFilesIn([`${A}.mp4`, `${B}-thumb.jpg`, "keep.me"], [])).toEqual([
      `${A}.mp4`,
      `${B}-thumb.jpg`,
    ]);
  });

  it("빈 디렉터리는 빈 배열", () => {
    expect(orphanFilesIn([], [A])).toEqual([]);
  });
});

// ── L1-1 ~ L1-3: 잔재 정리 완결성 (소스 스캔) ──────────────────────────────

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function filesContaining(needle: RegExp): string[] {
  return sourceFiles(SRC)
    .filter((path) => needle.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(SRC.length + 1));
}

describe("Supabase 잔재 정리", () => {
  it("소스 어디에도 supabase 언급이 남지 않는다", () => {
    expect(filesContaining(/supabase/i)).toEqual([]);
  });

  it("migrateSupabaseMedia 심볼이 남지 않는다", () => {
    expect(filesContaining(/migrateSupabaseMedia/)).toEqual([]);
  });

  it("볼륨 청소는 살아남아 부팅 훅에 연결돼 있다", () => {
    // Supabase 정리와 같은 파일에 있었다는 이유로 함께 지워지면
    // 고아 영상 파일이 볼륨에 영원히 쌓인다.
    expect(filesContaining(/cleanupOrphanVideoFiles/)).toContain("server.ts");
  });
});
