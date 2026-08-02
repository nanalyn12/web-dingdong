// Client-safe half of the AI quota feature. Only the marker lives here so that
// dingdong-bot.tsx can recognise a quota rejection without pulling the
// server-only module (and its db import) into the browser bundle.
//
// Server functions serialise errors down to `message`, so the marker travels
// in the text and the client strips it before showing the rest.
export const AI_QUOTA_MARKER = "[QUOTA]";

/** Returns the user-facing text when `message` is a quota rejection. */
export function parseQuotaMessage(message: string): string | null {
  return message.startsWith(AI_QUOTA_MARKER) ? message.slice(AI_QUOTA_MARKER.length).trim() : null;
}
