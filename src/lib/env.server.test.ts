import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENV_SPEC, assertServerEnv, checkEnv, reportServerEnv } from "./env.server";

/** 필수 키가 전부 채워진 최소 환경. 테스트마다 여기서 덜어내며 검증한다. */
function fullEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const entry of ENV_SPEC) env[entry.name] = "value";
  return env;
}

describe("ENV_SPEC", () => {
  it("키 이름이 중복되지 않는다", () => {
    const names = ENV_SPEC.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("모든 항목이 어떤 기능에 쓰이는지 설명을 갖는다", () => {
    for (const entry of ENV_SPEC) {
      expect(entry.feature.length).toBeGreaterThan(0);
    }
  });

  it("선언된 모든 키가 .env.example에 문서화되어 있다", () => {
    // 저장소에 체크인된 정적 파일만 읽는다 — 외부 상태에 의존하지 않으므로
    // 순수 로직 테스트와 같은 결정성을 갖는다. 새 키를 추가하면서
    // .env.example 갱신을 빠뜨리는 사고를 이 테스트가 잡는다.
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const documented = new Set(
      example
        .split("\n")
        .map((line) => line.replace(/^#\s*/, "").match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );
    const missing = ENV_SPEC.map((entry) => entry.name).filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  });
});

describe("checkEnv", () => {
  it("필수 키가 모두 있으면 누락이 없다", () => {
    expect(checkEnv(fullEnv()).missingRequired).toEqual([]);
  });

  it("필수 키가 없으면 누락 목록에 담긴다", () => {
    const env = fullEnv();
    delete env.DATABASE_URL;
    expect(checkEnv(env).missingRequired).toContain("DATABASE_URL");
  });

  it("빈 문자열은 설정되지 않은 것으로 본다", () => {
    const env = fullEnv();
    env.BETTER_AUTH_SECRET = "";
    expect(checkEnv(env).missingRequired).toContain("BETTER_AUTH_SECRET");
  });

  it("공백만 있는 값도 설정되지 않은 것으로 본다", () => {
    const env = fullEnv();
    env.BETTER_AUTH_SECRET = "   ";
    expect(checkEnv(env).missingRequired).toContain("BETTER_AUTH_SECRET");
  });

  it("선택 키가 없으면 꺼지는 기능을 알려준다", () => {
    const env = fullEnv();
    delete env.GEMINI_API_KEY;
    const disabled = checkEnv(env).disabledFeatures;
    expect(disabled.map((entry) => entry.name)).toContain("GEMINI_API_KEY");
    expect(checkEnv(env).missingRequired).not.toContain("GEMINI_API_KEY");
  });

  it("선택 키가 모두 채워지면 꺼지는 기능이 없다", () => {
    expect(checkEnv(fullEnv()).disabledFeatures).toEqual([]);
  });

  it("빈 환경에서는 모든 필수 키가 누락으로 보고된다", () => {
    const required = ENV_SPEC.filter((entry) => entry.required).map((entry) => entry.name);
    expect(checkEnv({}).missingRequired).toEqual(required);
  });

  it("스펙에 없는 키가 있어도 무시한다", () => {
    const env = { ...fullEnv(), TOTALLY_UNRELATED: "x" };
    expect(checkEnv(env).missingRequired).toEqual([]);
  });
});

describe("assertServerEnv", () => {
  it("필수 키가 채워져 있으면 던지지 않는다", () => {
    expect(() => assertServerEnv(fullEnv())).not.toThrow();
  });

  it("필수 키가 없으면 누락된 이름을 담아 던진다", () => {
    const env = fullEnv();
    delete env.DATABASE_URL;
    expect(() => assertServerEnv(env)).toThrow(/DATABASE_URL/);
  });

  it("여러 개가 없으면 한 번에 모두 알려준다", () => {
    expect(() => assertServerEnv({})).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });
});

describe("reportServerEnv", () => {
  function spyLogger() {
    const errors: string[] = [];
    const warns: string[] = [];
    return {
      errors,
      warns,
      logger: {
        error: (message: string) => errors.push(message),
        warn: (message: string) => warns.push(message),
      },
    };
  }

  it("모두 채워져 있으면 아무것도 로깅하지 않는다", () => {
    const { errors, warns, logger } = spyLogger();
    reportServerEnv(fullEnv(), logger);
    expect(errors).toEqual([]);
    expect(warns).toEqual([]);
  });

  it("필수 누락은 error로 남기되 부팅을 막지 않는다", () => {
    const env = fullEnv();
    delete env.DATABASE_URL;
    const { errors, logger } = spyLogger();
    expect(() => reportServerEnv(env, logger)).not.toThrow();
    expect(errors.join("\n")).toContain("DATABASE_URL");
  });

  it("선택 누락은 warn으로 남기고 꺼지는 기능을 설명한다", () => {
    const env = fullEnv();
    delete env.SUNO_API_KEY;
    const { errors, warns, logger } = spyLogger();
    reportServerEnv(env, logger);
    expect(errors).toEqual([]);
    expect(warns.join("\n")).toContain("SUNO_API_KEY");
  });
});
