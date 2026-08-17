import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { open, seal } from "./secret-box.server";

const ORIGINAL = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = ORIGINAL;
});

describe("seal / open", () => {
  it("봉인한 값을 그대로 되돌린다", () => {
    const key = "AIzaSy-not-a-real-key";
    expect(open(seal(key))).toBe(key);
  });

  it("한글·이모지가 섞여도 왕복이 깨지지 않는다", () => {
    const plain = "키 값 🔑 with spaces";
    expect(open(seal(plain))).toBe(plain);
  });

  it("빈 문자열은 봉인되지만 다시 열리지 않는다 (알려진 경계)", () => {
    // 본문이 비면 세 번째 조각이 빈 문자열이라 open()의 형식 검사에 걸린다.
    // 빈 키는 저장 대상이 아니어서 실제 경로에는 영향이 없지만, 동작이
    // 바뀌면 알아차릴 수 있게 고정해 둔다.
    expect(open(seal(""))).toBeNull();
  });

  it("같은 평문이라도 매번 다른 암호문이 된다", () => {
    // IV가 매번 새로 생성되므로, 같은 키를 쓰는 두 사용자의 행을 비교해도
    // 같은 값을 넣었는지 알 수 없다.
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("암호문에 평문이 남지 않는다", () => {
    expect(seal("plaintext-marker")).not.toContain("plaintext-marker");
  });
});

describe("open — 열 수 없는 값", () => {
  it("형식이 아니면 null이다", () => {
    expect(open("")).toBeNull();
    expect(open("not-sealed")).toBeNull();
    expect(open("only.two")).toBeNull();
  });

  it("본문이 변조되면 null이다", () => {
    // GCM 인증 태그가 어긋나므로 조용히 다른 평문이 나오는 일은 없다.
    const sealed = seal("original");
    const [iv, tag, body] = sealed.split(".");
    const tampered = `${iv}.${tag}.${body.slice(0, -2)}AA`;
    expect(open(tampered)).toBeNull();
  });

  it("시크릿이 바뀌면 null이다 — 던지지 않는다", () => {
    // 호출부는 공용 키로 폴백하고 사용자에게 재입력을 안내한다.
    const sealed = seal("rotate-me");
    process.env.BETTER_AUTH_SECRET = "completely-different-secret";
    expect(open(sealed)).toBeNull();
  });
});

describe("seal — 시크릿이 없을 때", () => {
  it("조용히 평문을 저장하지 않고 던진다", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => seal("secret")).toThrow(/BETTER_AUTH_SECRET/);
  });
});
