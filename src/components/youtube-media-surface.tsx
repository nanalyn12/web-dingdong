import type React from "react";
import { useEffect, useRef } from "react";

import type { PlayerAPI } from "@/lib/player-api";

// A bare YouTube embed gives the page no clock and no seek, which leaves
// curated songs with no karaoke at all — the highlight can never move because
// currentTime is always 0. The IFrame Player API is the sanctioned way to get
// both, so curated songs go through it and expose the same PlayerAPI as the
// native <audio> surface.

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
};

type YTPlayerEvent = { target: YTPlayer; data?: number };

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    cfg: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YTPlayerEvent) => void;
        onStateChange?: (e: YTPlayerEvent) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Load the IFrame API once per page. The API signals readiness through a
 * single global callback, so chain onto any existing one rather than
 * clobbering it. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without a Player"));
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => reject(new Error("YouTube API script failed to load"));
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function YouTubeMediaSurface({
  videoId,
  title,
  onTime,
  onDuration,
  onPlayingChange,
  apiRef,
  playbackRate,
  muted,
}: {
  videoId: string;
  title: string;
  onTime: (t: number) => void;
  onDuration: (d: number) => void;
  onPlayingChange: (p: boolean) => void;
  apiRef: React.MutableRefObject<PlayerAPI | null>;
  playbackRate: number;
  muted: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const stopRaf = () => {
      if (rafRef.current !== null) cancelFrame(rafRef.current);
      rafRef.current = null;
    };
    // The API has no timeupdate event — polling is the only way to get a clock,
    // and rAF keeps the karaoke highlight frame-accurate while playing.
    const tick = () => {
      const p = playerRef.current;
      if (p) onTime(p.getCurrentTime());
      rafRef.current = requestAnimationFrame(tick);
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const player = new YT.Player(hostRef.current, {
          videoId,
          playerVars: {
            enablejsapi: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerRef.current = e.target;
              onDuration(e.target.getDuration() || 0);
              e.target.setPlaybackRate(playbackRate);
              if (muted) e.target.mute();
              onTime(e.target.getCurrentTime());
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const state = e.data;
              const playing = state === YT.PlayerState.PLAYING;
              onPlayingChange(playing);
              // Duration is often still 0 at onReady for a cued video.
              const d = e.target.getDuration();
              if (d) onDuration(d);
              stopRaf();
              if (playing) rafRef.current = requestAnimationFrame(tick);
              else onTime(e.target.getCurrentTime());
            },
          },
        });
        playerRef.current = player;
        apiRef.current = {
          play: () => player.playVideo(),
          pause: () => player.pauseVideo(),
          toggle: () => {
            const st = player.getPlayerState();
            if (st === YT.PlayerState.PLAYING) player.pauseVideo();
            else player.playVideo();
          },
          seek: (t: number) => {
            player.seekTo(t, true);
            player.playVideo();
          },
          setRate: (r: number) => player.setPlaybackRate(r),
          setMuted: (m: boolean) => (m ? player.mute() : player.unMute()),
        };
      })
      .catch((err) => {
        console.warn("[youtube] player init failed:", err);
      });

    return () => {
      cancelled = true;
      stopRaf();
      apiRef.current = null;
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be gone with the unmounted iframe.
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    playerRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.mute();
    else p.unMute();
  }, [muted]);

  return (
    <div
      role="group"
      aria-label={title}
      className="rounded-2xl overflow-hidden bg-black aspect-video shadow-[var(--shadow-soft)]"
    >
      {/* The API swaps this node out for the player iframe, so anything set
          on it (title, classes) is discarded — label the wrapper instead. */}
      <div ref={hostRef} className="w-full h-full" />
    </div>
  );
}

function cancelFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
}
