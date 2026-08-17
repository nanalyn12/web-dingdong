// 백업 파일의 무결성(체크섬)과 출처(서명)를 다룬다. SERVER-ONLY.
//
// 체크섬은 파일이 도중에 깨졌는지, 서명은 이 배포가 만든 파일이 맞는지를 본다.
// 서명이 필요한 이유: 체크섬만 있으면 공격자가 ownerId를 남의 것으로 고치고
// 체크섬을 다시 계산해 붙일 수 있다. 서명 키는 BETTER_AUTH_SECRET에서 HKDF로
// 파생하므로 새로 넣어야 할 비밀값은 없다 (secret-box.server.ts와 같은 방식).
//
// 뒤집어 말하면 BETTER_AUTH_SECRET을 교체하거나 다른 배포로 옮기면 이전 백업
// 파일의 서명은 더 이상 맞지 않는다. 그때는 저장된 백업에서 복원하면 된다 —
// 서명은 "업로드된 파일"에만 요구한다.
import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { BACKUP_VERSION } from "./tenant-backup";

const INFO = "dingdong:tenant-backup:v1";

function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET가 설정되지 않아 백업에 서명할 수 없어요.");
  }
  return Buffer.from(hkdfSync("sha256", secret, "dingdong-backup-sign", INFO, 32));
}

/** 키 순서·공백에 흔들리지 않는 정규 직렬화. 같은 데이터는 언제나 같은 문자열. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const source = value as Record<string, unknown>;
  const body = Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(source[key])}`)
    .join(",");
  return `{${body}}`;
}

/** 백업 데이터의 sha256 (64자 hex). */
export function checksumOf(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

/** ownerId와 체크섬을 함께 묶어 서명한다 — 둘 중 하나만 바꿔도 깨진다. */
export function signPayload(ownerId: string, checksum: string): string {
  return createHmac("sha256", signingKey())
    .update(`${BACKUP_VERSION}\n${ownerId}\n${checksum}`, "utf8")
    .digest("base64url");
}

/** 서명 검증. 어떤 이유로든(키 부재, 길이 불일치, 변조) 맞지 않으면 false. */
export function verifyPayload(input: {
  ownerId: string;
  checksum: string;
  signature: string;
}): boolean {
  try {
    const expected = Buffer.from(signPayload(input.ownerId, input.checksum), "utf8");
    const actual = Buffer.from(input.signature ?? "", "utf8");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
