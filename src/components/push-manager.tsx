import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Share, X } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import {
  deleteSubscription,
  getVapidPublicKey,
  mySubscriptionStatus,
  saveSubscription,
} from "@/lib/push.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ASKED_KEY = "dingdong:push-asked:v1";
const IOS_BANNER_KEY = "dingdong:ios-install:v1";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushManager() {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  const getKey = useServerFn(getVapidPublicKey);
  const save = useServerFn(saveSubscription);
  const remove = useServerFn(deleteSubscription);
  const status = useServerFn(mySubscriptionStatus);

  // Register service worker once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Avoid registering in editor preview iframes
    const host = window.location.hostname;
    const isPreview =
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovableproject-dev.com");
    if (isPreview) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Check existing subscription
  useEffect(() => {
    if (!session) return;
    status({})
      .then((r) => setSubscribed(!!r?.hasSubscription))
      .catch(() => {});
  }, [session, status]);

  // Auto-prompt the modal once (gently) after sign-in
  useEffect(() => {
    if (!session) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(ASKED_KEY)) return;
    if (Notification?.permission === "granted" || Notification?.permission === "denied") return;
    const t = setTimeout(() => setOpen(true), 4000);
    return () => clearTimeout(t);
  }, [session]);

  // iOS install banner
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isIOS() || isStandalone()) return;
    if (localStorage.getItem(IOS_BANNER_KEY)) return;
    setShowIOSBanner(true);
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error("이 브라우저는 푸시 알림을 지원하지 않아요.");
        return;
      }
      const permission = await Notification.requestPermission();
      localStorage.setItem(ASKED_KEY, "1");
      if (permission !== "granted") {
        toast.info("알림을 거부했어요. 언제든 다시 켤 수 있어요.");
        setOpen(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await getKey({});
      if (!publicKey) throw new Error("VAPID 키가 설정되지 않았어요.");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          user_agent: navigator.userAgent,
        },
      });
      setSubscribed(true);
      setOpen(false);
      toast.success("叮叮가 알림으로 챙겨줄게요! 🐼");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "구독 실패";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await remove({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("알림을 껐어요.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "해지 실패";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <>
      {/* Floating notification toggle (top-right of header area) - small chip */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed top-20 right-6 z-40 h-10 w-10 rounded-full glass shadow-md",
          "flex items-center justify-center hover:scale-105 transition",
        )}
        title="알림 설정"
        aria-label="알림 설정"
      >
        {subscribed ? (
          <Bell className="h-4 w-4 text-pink-500" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Permission modal */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="glass rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
            <div className="flex justify-between items-start mb-3">
              <div className="text-3xl">🐼🛎️</div>
              <button
                onClick={() => {
                  localStorage.setItem(ASKED_KEY, "1");
                  setOpen(false);
                }}
                className="p-1 rounded-full hover:bg-white/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-lg font-bold mb-1">叮叮가 챙겨줄까요?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              3일 이상 안 오면 판다가 살짝 알림을 보낼게요. 하루 한 번만요!
            </p>
            {subscribed ? (
              <Button
                onClick={unsubscribe}
                disabled={busy}
                variant="outline"
                className="w-full rounded-2xl"
              >
                알림 끄기
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={subscribe}
                  disabled={busy}
                  className="w-full rounded-2xl gradient-primary text-primary-foreground"
                >
                  {busy ? "설정 중…" : "알림 받을게요 🛎️"}
                </Button>
                <button
                  onClick={() => {
                    localStorage.setItem(ASKED_KEY, "1");
                    setOpen(false);
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  나중에
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* iOS install banner */}
      {showIOSBanner && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[calc(100vw-2rem)] glass rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3">
          <Share className="h-5 w-5 text-pink-500 shrink-0" />
          <p className="text-xs flex-1">
            iOS는 <b>홈 화면에 추가</b> 후에만 알림을 받을 수 있어요. 공유 → 홈 화면에 추가!
          </p>
          <button
            onClick={() => {
              localStorage.setItem(IOS_BANNER_KEY, "1");
              setShowIOSBanner(false);
            }}
            className="p-1 rounded-full hover:bg-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
