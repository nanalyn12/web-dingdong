import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/*
 * Batch ⑬ — one rule, one place.
 *
 * roles.ts opens by saying why it exists: "화면과 서버가 각자 조건을 적으면
 * 한쪽만 고쳐졌을 때 버튼은 보이는데 저장이 안 되는 상태가 된다." It has said
 * that since it was written, and by this batch there were still SIXTEEN copies
 * of `role === "teacher" || role === "admin"` spelled out inline — eight of
 * them in `_app.songs.$id.tsx` alone, one of them (`admin.functions.ts:48`) on
 * the server. Sixteen places to remember when a fourth editor role appears, or
 * when the rule grows a condition. Nobody remembers sixteen.
 *
 * A count would say something is wrong without saying where, so every offender
 * is reported as `파일:줄 → 표현식`.
 *
 * The hard part of this guard is not finding the sixteen. It is NOT finding the
 * six lines that look identical and are not the same question (F-3):
 *
 *   - `_app.students.tsx`  — `s.role === "teacher"`, the role of SOMEONE ELSE
 *                            in a roster row, rendered as a badge.
 *   - `app-shell.tsx`      — a three-way badge branch: 관리자 / 교수자 / 학생.
 *   - `_app.onboarding.tsx`— badge wording, "이미 {관리자|교사} 권한이 있어요".
 *   - `profile.functions.ts` — whether the admin bootstrap has been spent.
 *
 * None of those ask "may the current user edit this?", and a guard that flags
 * them fails code that is correct — which gets the guard deleted, which is
 * worse than not having written it. So the shape being matched is specifically
 * a two-role editor test: `=== "teacher" || === "admin"` (either order) or its
 * negation `!== "teacher" && !== "admin"`. A single comparison, or two joined
 * the other way, is left alone.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Every source file except the tests. Tests name the roles constantly and
 * legitimately — nav-items.test.ts drives `it.each(["student","teacher",…])`,
 * and this very file quotes the offending shapes to prove the regex still
 * bites. Scanning them would make the guard's own fixtures fail it.
 */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** `src/routes/_app.foo.tsx:42` — clickable, so a failure is actionable. */
function locate(file: string, source: string, index: number): string {
  const rel = file.slice(REPO.length).split(sep).join("/");
  return `${rel}:${lineOf(source, index)}`;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** 주석은 규칙을 설명하려고 판정식을 예시로 적을 수 있다. 코드만 본다. */
function codeOnly(source: string): string {
  // Blanked, not deleted, so byte offsets — and therefore line numbers — survive.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/**
 * `x === "teacher" || y === "admin"`, or `x !== "teacher" && y !== "admin"`.
 *
 * `[^;\n]` keeps the match inside one statement on one line: that is what makes
 * the app-shell ternary — where the two comparisons sit on separate lines with
 * a `?` between them — invisible to this regex.
 *
 * Built with String.raw. Written as a plain quoted string, `\s` and `\|` are at
 * the mercy of whatever escaped the text on its way into the file.
 */
const INLINE_EDITOR_CHECK = new RegExp(
  String.raw`[\w$.?[\]]*\s*(===|!==)\s*"(teacher|admin)"\s*(\|\||&&)[^;\n]*?(===|!==)\s*"(teacher|admin)"`,
  "g",
);

/**
 * `["admin", "teacher"]` — the rule itself, copied. Only roles.ts may hold it.
 */
const EDITOR_ROLES_PAIR = new RegExp(
  String.raw`\[\s*"(teacher|admin)"\s*,\s*"(teacher|admin)"\s*\]`,
  "g",
);

function scanRolesArray(source: string): string[] {
  const hits: string[] = [];
  const code = codeOnly(source);
  for (const m of code.matchAll(EDITOR_ROLES_PAIR)) {
    if (m[1] !== m[2]) hits.push(m[0]);
  }
  for (const m of code.matchAll(/\bEDITOR_ROLES\b/g)) hits.push(m[0]);
  return hits;
}

type Hit = { line: number; text: string };

function scan(source: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of codeOnly(source).matchAll(INLINE_EDITOR_CHECK)) {
    const [, op1, role1, combinator, op2, role2] = m;
    if (op1 !== op2) continue; // mixed operators are not this shape
    if (role1 === role2) continue; // `=== "teacher" || === "teacher"` is not a role test
    // Equality pairs with ||, inequality with &&. `=== "teacher" && … === "admin"`
    // is unsatisfiable, and `s.role === "teacher" && <Badge/>` is the roster case.
    const paired = (op1 === "===" && combinator === "||") || (op1 === "!==" && combinator === "&&");
    if (!paired) continue;
    hits.push({ line: lineOf(source, m.index), text: m[0].replace(/\s+/g, " ") });
  }
  return hits;
}

const FILES = sourceFiles().map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("편집 권한 판정의 단일 출처", () => {
  // F-2 — 16곳. This is the list that has to reach zero.
  it("인라인 편집 권한 판정이 남아 있지 않다", () => {
    const offenders: string[] = [];
    for (const { path, source } of FILES) {
      for (const hit of scan(source)) {
        const rel = path.slice(REPO.length).split(sep).join("/");
        offenders.push(`${rel}:${hit.line} → ${hit.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // roles.ts 안의 배열 하나가 규칙이다. 밖에 다시 나타나면 그 순간부터 규칙이
  // 둘이고, 둘은 언젠가 갈라진다.
  it("EDITOR_ROLES 목록이 roles.ts 밖에 다시 나타나지 않는다", () => {
    const offenders: string[] = [];
    for (const { path, source } of FILES) {
      if (path.endsWith(`${sep}roles.ts`)) continue;
      const code = codeOnly(source);
      for (const m of code.matchAll(EDITOR_ROLES_PAIR)) {
        if (m[1] === m[2]) continue;
        offenders.push(`${locate(path, source, m.index)} → ${m[0]}`);
      }
      for (const m of code.matchAll(/\bEDITOR_ROLES\b/g)) {
        offenders.push(`${locate(path, source, m.index)} → EDITOR_ROLES`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/*
 * F-3 — the six lines that must survive the sweep.
 *
 * Each anchor is asserted to still exist before it is asserted not to be
 * flagged: line numbers drift, and an anchor that silently stops matching would
 * turn this into a test that proves nothing.
 */
const EXCLUDED = [
  {
    file: "src/routes/_app.students.tsx",
    anchor: `s.role === "teacher"`,
    why: "명단에 실린 다른 사람의 역할 배지 — 현재 사용자의 권한이 아니다",
  },
  {
    file: "src/components/app-shell.tsx",
    anchor: `profile.role === "admin"`,
    why: "역할 배지 3분기 표시",
  },
  {
    file: "src/components/app-shell.tsx",
    anchor: `profile.role === "teacher"`,
    why: "역할 배지 3분기 표시",
  },
  {
    file: "src/routes/_app.onboarding.tsx",
    anchor: `profile.role === "admin" ? "관리자"`,
    why: "배지 문구 분기 — 이미 권한이 있다는 안내",
  },
  {
    file: "src/lib/profile.functions.ts",
    anchor: `profile.role === "admin"`,
    why: "관리자 부트스트랩 소진 판정",
  },
] as const;

describe("과잉 가드가 아닌가 (F-3 제외 대상)", () => {
  it.each(EXCLUDED)("$file 의 `$anchor` 는 그대로 있다 ($why)", ({ file, anchor }) => {
    const source = readFileSync(join(REPO, ...file.split("/")), "utf8");
    expect(source).toContain(anchor);
  });

  it.each(EXCLUDED)("$file 의 `$anchor` 를 가드가 잡지 않는다", ({ file, anchor }) => {
    const source = readFileSync(join(REPO, ...file.split("/")), "utf8");
    const flagged = new Set(scan(source).map((h) => h.line));
    const anchorLines: number[] = [];
    let from = source.indexOf(anchor);
    while (from !== -1) {
      anchorLines.push(lineOf(source, from));
      from = source.indexOf(anchor, from + 1);
    }
    expect(anchorLines.length).toBeGreaterThan(0);
    expect(anchorLines.filter((line) => flagged.has(line))).toEqual([]);
  });
});

describe("가드 자체의 검출력", () => {
  // 정규식 가드는 아무것도 매치하지 않아도 영원히 통과한다. 위반을 주입해
  // 아직 물리는지 확인한다 — 위 목록이 0이 된 뒤에는 이 테스트만이 가드가
  // 살아 있다는 증거다.
  it.each([
    `const isEditor = profile?.role === "teacher" || profile?.role === "admin";`,
    `if (prof.role === "admin" || prof.role === "teacher") return { ok: true };`,
    `if (role !== "teacher" && role !== "admin") throw new Error("nope");`,
  ])("주입한 위반을 잡는다: %s", (line) => {
    expect(scan(line)).toHaveLength(1);
  });

  it.each([
    `{s.role === "teacher" && (`,
    `profile.role === "admin" ? "관리자" : "교사"`,
    `if (shouldBeAdmin && !bootstrap && profile.role === "admin") {`,
    `const isEditor = isEditorRole(profile?.role);`,
    `// role === "teacher" || role === "admin" 를 쓰지 말 것`,
  ])("제외 대상은 잡지 않는다: %s", (line) => {
    expect(scan(line)).toEqual([]);
  });

  // EDITOR_ROLES 가드는 오늘 이미 통과한다 — 지금 저장소에 사본이 없기 때문이다.
  // 그래서 그 가드가 살아 있다는 증거는 이 주입 테스트뿐이다. 이것이 없으면
  // "영원히 통과하는 테스트"와 구별할 방법이 없다.
  it.each([
    `const EDITOR = ["admin", "teacher"] as const;`,
    `if (["teacher", "admin"].includes(role)) return true;`,
    `import { EDITOR_ROLES } from "./roles";`,
  ])("복제된 역할 목록을 잡는다: %s", (line) => {
    expect(scanRolesArray(line).length).toBeGreaterThan(0);
  });

  it.each([
    `pgEnum("app_role", ["student", "teacher", "admin"])`,
    `it.each(["student", "teacher", "admin", undefined])`,
    `const EDITOR_ONLY_URLS = ["/students", "/curriculum"];`,
  ])("역할 목록이 아닌 배열은 잡지 않는다: %s", (line) => {
    expect(scanRolesArray(line)).toEqual([]);
  });
});

/*
 * 신규 콘솔 모듈은 처음부터 깨끗하게 태어나야 한다. 열일곱 번째 사본을 만들면서
 * 앞의 열여섯을 지우는 것은 이 배치를 헛수고로 만든다.
 *
 * 여기 목록이 둘뿐인 이유는 기준서 L1-E-4와 다르다 — 리더 확정 Q-5가
 * `isAdminRole`을 이번 배치에서 만들지 않기로 했으므로, 관리자 단독 판정이
 * 필요한 `console-summary.ts`와 `console.functions.ts`는 `"admin"` 리터럴을
 * 피할 수단이 없다. 그 둘은 test-author가 리더에게 반송했다.
 */
const CLEAN_MODULES = ["console-cards.ts"];

describe("신규 콘솔 모듈", () => {
  it.each(CLEAN_MODULES)("%s 는 role 문자열을 직접 적지 않는다", (name) => {
    const path = join(SRC, "lib", name);
    expect(existsSync(path)).toBe(true);
    const code = codeOnly(readFileSync(path, "utf8"));
    const offenders = [...code.matchAll(/["'`](teacher|admin)["'`]/g)].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });
});
