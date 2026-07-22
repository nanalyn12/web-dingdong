/** Imperative handle the song page drives playback through. Both the native
 * <audio>/<video> surface and the YouTube iframe surface implement it, so the
 * karaoke UI (seek-to-lyric, prev/next line, rate, mute) is source-agnostic. */
export type PlayerAPI = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  setMuted: (m: boolean) => void;
};
