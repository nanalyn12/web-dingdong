import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Clapperboard,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useIsEditor } from "@/lib/auth-client";
import {
  FOCUS_LABEL,
  LENGTHS,
  RESOLUTIONS,
  VOICES,
  type VideoFocus,
  type VideoJobConfig,
  type VideoLanguage,
} from "@/lib/video/config";
import {
  approveVideoUpload,
  createVideoJobs,
  deleteVideoJob,
  getYouTubeStatus,
  listVideoJobs,
  retryVideoJob,
  suggestVideoTopics,
} from "@/lib/video/studio.functions";

export const Route = createFileRoute("/_app/studio")({
  head: () => ({ meta: [{ title: "영상 스튜디오 — DingDong" }] }),
  component: StudioPage,
});

const STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  running: "생성 중",
  awaiting_approval: "업로드 승인 대기",
  uploading: "업로드 중",
  done: "완료",
  failed: "실패",
};

function StudioPage() {
  const isEditor = useIsEditor();
  const qc = useQueryClient();

  const callCreate = useServerFn(createVideoJobs);
  const callList = useServerFn(listVideoJobs);
  const callApprove = useServerFn(approveVideoUpload);
  const callRetry = useServerFn(retryVideoJob);
  const callDelete = useServerFn(deleteVideoJob);
  const callSuggest = useServerFn(suggestVideoTopics);
  const callYt = useServerFn(getYouTubeStatus);

  // ── wizard state ──
  const [keyword, setKeyword] = useState("");
  const [count, setCount] = useState(1);
  const [topic, setTopic] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [audience, setAudience] = useState("중국어 입문 성인 학습자");
  const [lengthSeconds, setLengthSeconds] = useState(60);
  const [language, setLanguage] = useState<VideoLanguage>("ko");
  const [focus, setFocus] = useState<VideoFocus>("culture");
  const [resolution, setResolution] =
    useState<VideoJobConfig["resolution"]>("1280x720");
  const [clipCount, setClipCount] = useState(6);
  const [voice, setVoice] = useState(VOICES.ko[0].value);
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [uploadMode, setUploadMode] =
    useState<VideoJobConfig["uploadMode"]>("approval");
  const [privacy, setPrivacy] = useState<VideoJobConfig["privacy"]>("private");

  const ytStatus = useQuery({
    queryKey: ["youtube-status"],
    queryFn: () => callYt({}),
    enabled: isEditor,
  });

  const jobs = useQuery({
    queryKey: ["video-jobs"],
    queryFn: () => callList({}),
    enabled: isEditor,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j) =>
        ["queued", "running", "uploading"].includes(j.status),
      )
        ? 3000
        : 15000,
  });

  const suggestMut = useMutation({
    mutationFn: () => callSuggest({ data: { keyword, focus, audience } }),
    onSuccess: (list) => setSuggestions(list),
    onError: (e) => toast.error(e instanceof Error ? e.message : "추천 실패"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      callCreate({
        data: {
          count,
          config: {
            keyword: keyword.trim(),
            topic: topic.trim(),
            audience,
            lengthSeconds,
            language,
            focus,
            resolution,
            clipCount,
            voice,
            burnSubtitles,
            uploadMode,
            privacy,
          },
        },
      }),
    onSuccess: (r) => {
      toast.success(`영상 생성 작업 ${r.ids.length}건을 시작했어요.`);
      qc.invalidateQueries({ queryKey: ["video-jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "생성 실패"),
  });

  function act(fn: (a: { data: { id: string } }) => Promise<unknown>, id: string) {
    fn({ data: { id } })
      .then(() => qc.invalidateQueries({ queryKey: ["video-jobs"] }))
      .catch((e) => toast.error(e instanceof Error ? e.message : "오류"));
  }

  if (!isEditor) {
    return (
      <div className="p-8 text-muted-foreground">
        교수자(teacher/admin) 전용 페이지입니다.
      </div>
    );
  }

  const voices = VOICES[language];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
          <Clapperboard className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">영상 스튜디오</h1>
          <p className="text-sm text-muted-foreground">
            키워드 → AI 대본 → Pexels 영상 → TTS·자막 → 렌더 → YouTube → 학습 콘텐츠
          </p>
        </div>
      </header>

      {/* YouTube connection */}
      <div className="glass rounded-3xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Youtube className="size-5 text-red-500" />
          <div className="text-sm">
            {ytStatus.data?.connected ? (
              <span className="text-green-700 font-medium">YouTube 채널 연결됨</span>
            ) : (
              <span className="text-muted-foreground">
                YouTube 미연결 — 업로드하려면 연결이 필요해요
              </span>
            )}
          </div>
        </div>
        {!ytStatus.data?.connected && (
          <Button asChild size="sm" variant="outline">
            <a href="/api/youtube/connect">YouTube 연결</a>
          </Button>
        )}
      </div>

      {/* Wizard */}
      <div className="glass rounded-3xl p-6 space-y-5">
        <h2 className="font-semibold text-lg">새 영상 만들기</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>① 핵심 키워드 *</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 중국 길거리 음식"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label>생성 개수</Label>
            <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}개</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>② 영상 주제 * (직접 입력 또는 AI 추천)</Label>
          <div className="flex gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 한국인이 꼭 먹어봐야 할 중국 길거리 음식 5가지"
              maxLength={120}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!keyword.trim()) return toast.error("키워드를 먼저 입력하세요.");
                suggestMut.mutate();
              }}
              disabled={suggestMut.isPending}
            >
              {suggestMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              AI 추천
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTopic(s)}
                  className="text-xs rounded-full border border-border bg-white/60 px-3 py-1.5 hover:bg-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>③ 타겟 시청자</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label>영상 길이</Label>
            <Select
              value={String(lengthSeconds)}
              onValueChange={(v) => setLengthSeconds(Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LENGTHS.map((l) => (
                  <SelectItem key={l.value} value={String(l.value)}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>나레이션 언어</Label>
            <Select
              value={language}
              onValueChange={(v) => {
                const lang = v as VideoLanguage;
                setLanguage(lang);
                setVoice(VOICES[lang][0].value);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어</SelectItem>
                <SelectItem value="zh">중국어</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>④ 대본 중점</Label>
            <Select value={focus} onValueChange={(v) => setFocus(v as VideoFocus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FOCUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>⑥ 해상도</Label>
            <Select
              value={resolution}
              onValueChange={(v) => setResolution(v as VideoJobConfig["resolution"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>클립(장면) 수</Label>
            <Select value={String(clipCount)} onValueChange={(v) => setClipCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}개</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>⑦ 음성</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 items-end">
          <div className="flex items-center gap-3 rounded-2xl bg-white/50 border border-border px-4 py-3">
            <Switch checked={burnSubtitles} onCheckedChange={setBurnSubtitles} id="burn" />
            <Label htmlFor="burn" className="cursor-pointer">
              ⑧ 자막 영상에 새기기 (burn-in)
            </Label>
          </div>
          <div className="space-y-2">
            <Label>⑩ 업로드 방식</Label>
            <Select
              value={uploadMode}
              onValueChange={(v) => setUploadMode(v as VideoJobConfig["uploadMode"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approval">미리보기 후 승인 업로드</SelectItem>
                <SelectItem value="auto">완전 자동 업로드</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>공개 설정</Label>
            <Select
              value={privacy}
              onValueChange={(v) => setPrivacy(v as VideoJobConfig["privacy"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">비공개</SelectItem>
                <SelectItem value="unlisted">일부 공개 (링크)</SelectItem>
                <SelectItem value="public">공개</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          className="w-full md:w-auto"
          disabled={createMut.isPending}
          onClick={() => {
            if (!keyword.trim()) return toast.error("키워드를 입력하세요.");
            if (!topic.trim()) return toast.error("주제를 입력하거나 추천받으세요.");
            createMut.mutate();
          }}
        >
          {createMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          🎬 영상 생성 시작
        </Button>
      </div>

      {/* Job list */}
      <div className="space-y-3">
        <h2 className="font-semibold text-lg">작업 현황</h2>
        {(jobs.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">아직 생성한 영상이 없어요.</p>
        )}
        <ul className="space-y-3">
          {(jobs.data ?? []).map((j) => {
            const cfg = j.config as { topic?: string; uploadMode?: string };
            const script = j.script as { title?: string } | null;
            const busy = ["queued", "running", "uploading"].includes(j.status);
            return (
              <li key={j.id} className="glass rounded-3xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {script?.title || cfg.topic || "제목 생성 중"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {STATUS_LABEL[j.status] ?? j.status} · {j.step} ·{" "}
                      {new Date(j.created_at).toLocaleString("ko-KR")}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {j.status === "awaiting_approval" && (
                      <Button size="sm" onClick={() => act(callApprove, j.id)}>
                        <Upload className="size-4 mr-1" /> 업로드 승인
                      </Button>
                    )}
                    {j.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => act(callRetry, j.id)}>
                        <RefreshCcw className="size-4 mr-1" /> 재시도
                      </Button>
                    )}
                    {!busy && (
                      <Button size="sm" variant="ghost" onClick={() => act(callDelete, j.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {busy && (
                  <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                    <div
                      className="h-full gradient-primary transition-all"
                      style={{ width: `${j.progress}%` }}
                    />
                  </div>
                )}

                {j.error && (
                  <p className="text-xs text-red-600 whitespace-pre-wrap">{j.error}</p>
                )}

                {j.video_path && j.status !== "done" && (
                  <video
                    src={`/media/${j.video_path}`}
                    controls
                    preload="metadata"
                    className="w-full max-w-md rounded-xl border border-border"
                  />
                )}

                {(j.youtube_video_id || j.drama_id) && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    {j.youtube_video_id && (
                      <a
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        href={`https://www.youtube.com/watch?v=${j.youtube_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Youtube className="size-4" /> YouTube에서 보기
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {j.drama_id && (
                      <Link
                        to="/dramas/$id"
                        params={{ id: j.drama_id }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Clapperboard className="size-4" /> 학습 콘텐츠 열기
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
