/**
 * Feature tests for browser APIs that are simply absent on some engines.
 *
 * These exist because of one crash: `push-manager.tsx` read
 * `Notification?.permission`, which reads as defensive and is not. Optional
 * chaining guards a null *value*; it cannot guard a missing *declaration*. On
 * iOS Safari there is no `Notification` binding at all outside an installed
 * PWA, so evaluating the identifier threw
 * `ReferenceError: Can't find variable: Notification` and the root error
 * boundary replaced the whole app with "This page didn't load".
 *
 * Reaching these through `window` is what makes the lookup safe — `window` is
 * always declared in a browser, and an absent property is merely `undefined`.
 */

type MaybeWindow = {
  Notification?: { permission?: string; requestPermission?: () => Promise<string> };
  PushManager?: unknown;
  ServiceWorkerRegistration?: unknown;
};

/** `globalThis` rather than `window`, so this is also correct during SSR. */
function browser(): MaybeWindow | null {
  return typeof globalThis === "undefined" ? null : (globalThis as MaybeWindow);
}

const PERMISSIONS = ["granted", "denied", "default"] as const;
export type NotificationPermissionValue = (typeof PERMISSIONS)[number];

/** The current permission, or `null` where the API does not exist. */
export function notificationPermission(): NotificationPermissionValue | null {
  const permission = browser()?.Notification?.permission;
  return (PERMISSIONS as readonly string[]).includes(permission ?? "")
    ? (permission as NotificationPermissionValue)
    : null;
}

/**
 * Web push needs all three: permission to notify, a push manager to subscribe
 * with, and a service worker to receive on. iOS Safari has the last one alone,
 * so testing for the service worker by itself is not enough.
 */
export function supportsWebPush(): boolean {
  const w = browser();
  if (!w) return false;
  return !!w.Notification && !!w.PushManager && !!w.ServiceWorkerRegistration;
}

/** Prompts for permission, or resolves `null` where the API does not exist. */
export async function requestNotificationPermission(): Promise<NotificationPermissionValue | null> {
  const api = browser()?.Notification;
  if (!api?.requestPermission) return null;
  const result = await api.requestPermission();
  return (PERMISSIONS as readonly string[]).includes(result)
    ? (result as NotificationPermissionValue)
    : null;
}
