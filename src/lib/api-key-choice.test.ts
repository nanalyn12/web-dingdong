import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  API_KEY_PROVIDERS,
  API_KEY_PROVIDER_META,
  classifySunoProbe,
  pickAiKey,
} from "./api-key-choice";

// ── L1-2: 키 선택 규칙 (①에서 이동, 동작 동일) ─────────────────────────────

describe("pickAiKey", () => {
  it("개인 키가 있으면 그것을 쓴다", () => {
    expect(pickAiKey({ userKey: "user-key", sharedKey: "shared-key" })).toEqual({
      key: "user-key",
      source: "user",
    });
  });

  it("개인 키가 없으면 공용 키로 폴백한다", () => {
    expect(pickAiKey({ userKey: null, sharedKey: "shared-key" })).toEqual({
      key: "shared-key",
      source: "shared",
    });
  });

  it("빈 문자열·공백뿐인 개인 키는 없는 것으로 본다", () => {
    expect(pickAiKey({ userKey: "", sharedKey: "shared-key" }).source).toBe("shared");
    expect(pickAiKey({ userKey: "   ", sharedKey: "shared-key" }).source).toBe("shared");
  });

  it("공백이 섞인 키는 다듬어서 쓴다", () => {
    expect(pickAiKey({ userKey: "  user-key\n", sharedKey: null }).key).toBe("user-key");
  });

  it("둘 다 없으면 던진다", () => {
    expect(() => pickAiKey({ userKey: null, sharedKey: null })).toThrow();
    expect(() => pickAiKey({ userKey: "  ", sharedKey: "" })).toThrow();
  });

  it("키가 없을 때의 안내가 'AI 설정'을 가리킨다", () => {
    // 사용자가 읽는 문구다. 환경변수 이름만 알려 주면 그가 할 수 있는 일이 없다.
    expect(() => pickAiKey({ userKey: null, sharedKey: null })).toThrow(/AI 설정/);
  });
});

// ── L1-1: 제공자별 오류 문구 ───────────────────────────────────────────────

describe("pickAiKey — 제공자별 안내", () => {
  it("기본은 Gemini 환경변수를 안내한다", () => {
    expect(() => pickAiKey({ userKey: null, sharedKey: null })).toThrow(/GEMINI_API_KEY/);
  });

  it("Suno 제공자를 넘기면 Suno 환경변수를 안내한다", () => {
    expect(() => pickAiKey({ userKey: null, sharedKey: null, provider: "suno" })).toThrow(
      /SUNO_API_KEY/,
    );
  });

  it("Suno 오류에 Gemini 환경변수를 섞지 않는다", () => {
    expect(() => pickAiKey({ userKey: null, sharedKey: null, provider: "suno" })).not.toThrow(
      /GEMINI_API_KEY/,
    );
  });
});

// ── L1-3 / L1-4: 제공자 메타데이터 ─────────────────────────────────────────

describe("API_KEY_PROVIDERS", () => {
  it("gemini와 suno를 모두 지원한다", () => {
    expect(API_KEY_PROVIDERS).toContain("gemini");
    expect(API_KEY_PROVIDERS).toContain("suno");
  });

  it("모든 제공자가 화면 렌더에 필요한 메타데이터를 갖춘다", () => {
    for (const provider of API_KEY_PROVIDERS) {
      const meta = API_KEY_PROVIDER_META[provider];
      expect(meta, provider).toBeDefined();
      for (const field of ["label", "envName", "issuerLabel", "placeholder", "what"] as const) {
        expect(meta[field]?.length, `${provider}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it("제공자마다 환경변수 이름이 다르다", () => {
    const envNames = API_KEY_PROVIDERS.map((p) => API_KEY_PROVIDER_META[p].envName);
    expect(new Set(envNames).size).toBe(envNames.length);
  });
});

// ── L1-8: Suno 프로브 판정 ─────────────────────────────────────────────────

describe("classifySunoProbe", () => {
  it("401·403은 잘못된 키로 본다", () => {
    expect(classifySunoProbe({ httpStatus: 401 })).toBe("invalid_key");
    expect(classifySunoProbe({ httpStatus: 403 })).toBe("invalid_key");
  });

  it("Suno 본문 코드 401도 잘못된 키로 본다", () => {
    expect(classifySunoProbe({ httpStatus: 200, apiCode: 401 })).toBe("invalid_key");
  });

  it("200 정상 응답은 통과다", () => {
    expect(classifySunoProbe({ httpStatus: 200, apiCode: 200 })).toBe("ok");
  });

  it("엔드포인트가 사라졌거나 서버 오류면 '확인 불가'로 두고 저장을 막지 않는다", () => {
    // 프로브 경로가 바뀌었다는 이유로 멀쩡한 키를 못 넣게 되는 쪽이 더 나쁜 실패다.
    expect(classifySunoProbe({ httpStatus: 404 })).toBe("unverified");
    expect(classifySunoProbe({ httpStatus: 500 })).toBe("unverified");
    expect(classifySunoProbe({ httpStatus: 0 })).toBe("unverified");
  });

  it("크레딧 부족(402)은 키가 유효하다는 뜻이므로 막지 않는다", () => {
    expect(classifySunoProbe({ httpStatus: 402 })).toBe("unverified");
  });
});

// ── L1-5 ~ L1-7: 연결 완결성 (소스 스캔) ───────────────────────────────────

const LIB = join(process.cwd(), "src", "lib");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function offenders(predicate: (text: string) => boolean, allow: string[]): string[] {
  return sourceFiles(LIB)
    .filter((path) => !allow.some((name) => path.endsWith(name)))
    .filter((path) => predicate(readFileSync(path, "utf8")))
    .map((path) => path.slice(LIB.length + 1));
}

// integrations.functions.ts는 모델·음원을 부르는 경로가 아니라 "플랫폼 공용 키가
// 설정돼 있는가"를 보여 주는 관리자 진단 화면이라, 개인 키가 아니라 공용 키를
// 보는 것이 정확한 동작이다.
const DIAGNOSTICS = "integrations.functions.ts";

describe("API 키 경로 연결 완결성", () => {
  it("AI 호출 경로가 GEMINI_API_KEY를 직접 읽지 않는다", () => {
    expect(
      offenders(
        (t) => t.includes("process.env.GEMINI_API_KEY"),
        ["ai-gateway.server.ts", DIAGNOSTICS],
      ),
    ).toEqual([]);
  });

  it("학습송 경로가 SUNO_API_KEY를 직접 읽지 않는다", () => {
    expect(
      offenders((t) => t.includes("process.env.SUNO_API_KEY"), ["suno.server.ts", DIAGNOSTICS]),
    ).toEqual([]);
  });

  it("인자 없는 createTextProvider() 호출이 남아 있지 않다", () => {
    expect(offenders((t) => /createTextProvider\(\s*\)/.test(t), [])).toEqual([]);
  });

  it("인자 없는 키 조회 헬퍼가 남아 있지 않다", () => {
    // getSunoKey() 처럼 호출부가 키를 의식하지 않게 만드는 함수가 다시 생기면
    // 그 경로는 개인 키를 영원히 무시한다.
    expect(offenders((t) => /getSunoKey\(\s*\)/.test(t), [])).toEqual([]);
  });

  it("AI 호출 경로가 모두 createTextProviderFor를 지난다", () => {
    const callers = sourceFiles(LIB)
      .filter((p) => readFileSync(p, "utf8").includes("createTextProviderFor"))
      .filter((p) => !p.endsWith("ai-gateway.server.ts"));
    expect(callers.length).toBeGreaterThanOrEqual(12);
  });
});
