/**
 * Local (아이디/비밀번호) accounts are always <username>@dingdong.local.
 * There is no mail server, so an address typed by the user proves nothing —
 * which is why the sign-up form never lets one through and `auth.server.ts`
 * re-checks the same rule on every /sign-up/email request. Real addresses can
 * only enter the system through Google OAuth, where Google vouches for them.
 *
 * Shared by the client form and the server hook so the two cannot drift.
 */
export const USERNAME_DOMAIN = "dingdong.local";

export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

/** True when `email` is exactly the address `username` is allowed to own. */
export function isValidLocalSignup(username: string, email: string): boolean {
  const uname = username.trim().toLowerCase();
  if (!USERNAME_RE.test(uname)) return false;
  return email.trim().toLowerCase() === usernameToEmail(uname);
}
