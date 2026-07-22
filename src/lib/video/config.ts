// Shared (client-safe) types + option lists for the video studio.

export type VideoLanguage = "ko" | "zh";
export type VideoFocus = "culture" | "grammar" | "entertainment" | "daily";
export type UploadMode = "auto" | "approval" | "web";

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
  // Optional course linkage: attach the finished video as a lesson.
  courseId?: string | null;
  newCourseTitle?: string;
  // Voice options
  speakingRate?: number; // 0.8 ~ 1.2 (default 1.0)
  repeatZh?: boolean; // speak Chinese runs twice for learners
  // Background music (focus-matched track, mixed at low volume). Default on.
  bgm?: boolean;
};

export const SPEAKING_RATES = [
  { value: 0.85, label: "천천히 (초급)" },
  { value: 1.0, label: "보통" },
  { value: 1.1, label: "빠르게" },
] as const;

// Chinese voice used for Han runs inside Korean narration (gender-matched).
export const ZH_PAIR_VOICE: Record<string, string> = {
  "ko-KR-Neural2-A": "cmn-CN-Standard-A",
  "ko-KR-Neural2-C": "cmn-CN-Standard-B",
  "ko-KR-Standard-A": "cmn-CN-Standard-A",
  "ko-KR-Standard-C": "cmn-CN-Standard-B",
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

export type SceneVocab = {
  zh: string;
  pinyin: string;
  ko: string;
  hsk?: number;
  emoji?: string;
};

export type SceneSegment = {
  text: string; // one narration sentence
  start: number; // seconds from video start (intro NOT included)
  end: number;
};

export type SceneQuiz = {
  type: "choice" | "fill";
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
};

export type ScriptScene = {
  index: number;
  narration: string; // narration text in target language
  // Full Korean rendering of `narration`. On Chinese-narration videos `ko`
  // below only covers the short `zh` teaching line, so using it as "the
  // translation" left most of what was actually said untranslated.
  narration_ko?: string;
  zh: string; // Chinese learning line featured in this scene
  pinyin: string;
  ko: string; // Korean translation of `zh` (the teaching line, not the narration)
  pexels_query: string; // English search query for stock footage
  vocab?: SceneVocab[]; // 3-5 words per scene → 단어장 저장 UI
  quiz?: SceneQuiz[]; // 2 questions per scene → 기존 MiniQuiz UI
  segments?: SceneSegment[]; // filled by the pipeline after TTS
};

export type VideoScript = {
  title: string; // YouTube title (Korean)
  description: string; // YouTube description
  tags: string[];
  scenes: ScriptScene[];
};
