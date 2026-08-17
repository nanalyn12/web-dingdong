import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checksumOf, signPayload, verifyPayload } from "./tenant-backup-crypto.server";

const ORIGINAL = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = ORIGINAL;
});

describe("checksumOf", () => {
  it("키 순서가 달라도 같은 체크섬을 낸다", () => {
    expect(checksumOf({ a: 1, b: 2 })).toBe(checksumOf({ b: 2, a: 1 }));
  });

  it("중첩 객체의 키 순서에도 흔들리지 않는다", () => {
    expect(checksumOf({ rows: [{ x: 1, y: 2 }] })).toBe(checksumOf({ rows: [{ y: 2, x: 1 }] }));
  });

  it("값이 한 글자만 달라도 체크섬이 달라진다", () => {
    expect(checksumOf({ title: "안녕" })).not.toBe(checksumOf({ title: "안녕!" }));
  });

  it("배열 순서가 다르면 체크섬이 달라진다", () => {
    expect(checksumOf([1, 2])).not.toBe(checksumOf([2, 1]));
  });

  it("64자 hex를 낸다", () => {
    expect(checksumOf({})).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("signPayload / verifyPayload", () => {
  const owner = "user_me";
  const sum = "a".repeat(64);

  it("자기가 만든 서명을 검증한다", () => {
    expect(
      verifyPayload({ ownerId: owner, checksum: sum, signature: signPayload(owner, sum) }),
    ).toBe(true);
  });

  it("ownerId를 위조하면 검증에 실패한다", () => {
    const signature = signPayload(owner, sum);
    expect(verifyPayload({ ownerId: "user_other", checksum: sum, signature })).toBe(false);
  });

  it("checksum을 변조하면 검증에 실패한다", () => {
    const signature = signPayload(owner, sum);
    expect(verifyPayload({ ownerId: owner, checksum: "b".repeat(64), signature })).toBe(false);
  });

  it("서명이 비어 있으면 검증에 실패한다", () => {
    expect(verifyPayload({ ownerId: owner, checksum: sum, signature: "" })).toBe(false);
  });

  it("길이가 다른 서명에도 예외 없이 false를 낸다", () => {
    expect(verifyPayload({ ownerId: owner, checksum: sum, signature: "short" })).toBe(false);
  });

  it("BETTER_AUTH_SECRET이 없으면 서명할 수 없다", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => signPayload(owner, sum)).toThrow();
  });
});
