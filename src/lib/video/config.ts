// Shared (client-safe) types + option lists for the video studio.

export type VideoLanguage = "ko" | "zh";
export type VideoFocus = "culture" | "grammar" | "entertainment" | "daily";
export type UploadMode = "auto" | "approval";

export type VideoJobConfig = {
  keyword: string;
  topic: string; // resolved topic (typed or AI-suggested)
  audience: string; // e.g. "중국어 입문 성인 학습자"
  lengthSeconds: number; // target total length (<= 300)
  language: VideoLanguage; // narration language
  focus: VideoFocus;
  resolution: "1280x720" | "1920x1080";
  clipCount: number; // number of Pexels clips / scenes (<= 20)
  voice: string; // Google Cloud TTS voice name
  burnSubtitles: boolean;
  uploadMode: UploadMode;
  privacy: "private" | "unlisted" | "public";
};

export const FOCUS_LABEL: Record<VideoFocus, string> = {
  culture: "문화",
  grammar: "어법",
  entertainment: "연예/트렌드",
  daily: "일상 회화",
};

export const VOICES: Record<VideoLanguage, { value: string; label: string }[]> = {
  ko: [
    { value: "ko-KR-Neural2-A", label: "한국어 여성 (Neural2-A)" },
    { value: "ko-KR-Neural2-C", label: "한국어 남성 (Neural2-C)" },
    { value: "ko-KR-Standard-A", label: "한국어 여성 (Standard-A)" },
    { value: "ko-KR-Standard-C", label: "한국어 남성 (Standard-C)" },
  ],
  zh: [
    { value: "cmn-CN-Standard-A", label: "중국어 여성 (Standard-A)" },
    { value: "cmn-CN-Standard-B", label: "중국어 남성 (Standard-B)" },
    { value: "cmn-CN-Standard-D", label: "중국어 여성 (Standard-D)" },
  ],
};

export const RESOLUTIONS = [
  { value: "1280x720", label: "HD 720p (권장·빠름)" },
  { value: "1920x1080", label: "FHD 1080p" },
] as const;

export const LENGTHS = [
  { value: 60, label: "1분 (쇼츠형)" },
  { value: 120, label: "2분" },
  { value: 180, label: "3분" },
  { value: 300, label: "5분" },
] as const;

export type ScriptScene = {
  index: number;
  narration: string; // narration text in target language
  zh: string; // Chinese learning line featured in this scene
  pinyin: string;
  ko: string; // Korean translation
  pexels_query: string; // English search query for stock footage
};

export type VideoScript = {
  title: string; // YouTube title (Korean)
  description: string; // YouTube description
  tags: string[];
  scenes: ScriptScene[];
};
