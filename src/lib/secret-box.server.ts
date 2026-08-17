// Authenticated encryption for secrets we hold on a user's behalf (personal
// API keys). SERVER-ONLY — never import from a client-bundled path.
//
// The data key is derived from BETTER_AUTH_SECRET via HKDF, so there is no
// second secret to provision. The flip side: rotating BETTER_AUTH_SECRET makes
// every sealed value undecryptable. That is a safe failure — `open()` returns
// null, the caller falls back to the shared key, and the user re-enters theirs.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const INFO = "dingdong:user-api-key:v1";

function dataKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET가 설정되지 않아 키를 안전하게 저장할 수 없어요.");
  }
  return Buffer.from(hkdfSync("sha256", secret, "dingdong-secret-box", INFO, 32));
}

/** Encrypt `plain` into a self-describing `iv.tag.ciphertext` string. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, dataKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Decrypt a value produced by `seal()`. Returns null if it cannot be opened
 *  (secret rotated, row corrupted, tampered ciphertext). */
export function open(sealed: string): string | null {
  try {
    const [ivPart, tagPart, bodyPart] = sealed.split(".");
    if (!ivPart || !tagPart || !bodyPart) return null;
    const decipher = createDecipheriv(ALGO, dataKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
