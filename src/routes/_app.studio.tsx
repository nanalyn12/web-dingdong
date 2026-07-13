import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Loader2,
  Play,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsEditor } from "@/lib/auth-client";
import { listCoursesWithCounts } from "@/lib/courses.functions";
import type { VideoJob, VideoSchedule } from "@/db/schema";
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
  createVideoSchedule,
  deleteVideoJob,
  deleteVideoSchedule,
  getYouTubeStatus,
  listVideoJobs,
  listVideoSchedules,
  retryVideoJob,
  runVideoScheduleNow,
  suggestVideoTopics,
  toggleVideoSchedule,
} from "@/lib/video/studio.functions";

export const Route = createFileRoute("/_app/studio")({
  head: () => ({ meta: [{ title: "영상 스튜디오 — DingDong" }] }),
  component: StudioPage,
});

const STATUS_META: Record<string, { label: string; cls: string }> = {
  queued: { label: "대기", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  running: { label: "생성 중", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  awaiting_approval: {
    label: "승인 대기",
    cls: "bg-purple-100 text-purple-700 border-purple-200",
  },
  uploading: { label: "업로드 중", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  done: { label: "완료", cls: "bg-green-100 text-green-700 border-green-200" },
  failed: { label: "실패", cls: "bg-red-100 text-red-700 border-red-200" },
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 강의 연동 셀렉트 (없음 / 기존 강의 / 새 강의 만들기) */
function CourseLinkSelect({
  courseLink,
  setCourseLink,
  newCourseTitle,
  setNewCourseTitle,
}: {
  courseLink: string; // "none" | "__new__" | courseId
  setCourseLink: (v: string) => void;
  newCourseTitle: string;
  setNewCourseTitle: (v: string) => void;
}) {
  const callCourses = useServerFn(listCoursesWithCounts);
  const courses = useQuery({
    queryKey: ["studio-courses"],
    queryFn: () => callCourses({}),
  });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>강의 연동 (선택 — 영상이 세부 강의로 추가돼요)</Label>
        <Select value={courseLink} onValueChange={setCourseLink}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">연동 안 함</SelectItem>
            {(courses.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                📚 {c.title} (세부 강의 {c.lesson_count}개)
              </SelectItem>
            ))}
            <SelectItem value="__new__">➕ 새 강의 만들기</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {courseLink === "__new__" && (
        <div className="space-y-2">
          <Label>새 강의 제목 *</Label>
          <Input
            value={newCourseTitle}
            onChange={(e) => setNewCourseTitle(e.target.value)}
            placeholder="예: 영상으로 배우는 중국 문화"
            maxLength={80}
          />
        </div>
      )}
    </div>
  );
}

function StudioPage() {
  const isEditor = useIsEditor();
  const qc = useQueryClient();

  const callList = useServerFn(listVideoJobs);
  const callYt = useServerFn(getYouTubeStatus);

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

  if (!isEditor) {
    return (
      <div className="p-8 text-muted-foreground">
        교수자(teacher/admin) 전용 페이지입니다.
      </div>
    );
  }

  const activeCount = (jobs.data ?? []).filter((j) =>
    ["queued", "running", "uploading", "awaiting_approval"].includes(j.status),
  ).length;

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
            <Clapperboard className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">영상 스튜디오</h1>
            <p className="text-sm text-muted-foreground">
              키워드 → AI 대본 → 스톡 영상 → TTS·자막 → YouTube → 학습 콘텐츠
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Youtube className="size-4 text-red-500" />
          {ytStatus.data?.connected ? (
            <span className="text-green-700 font-medium">연결됨</span>
          ) : (
            <Button asChild size="sm" variant="outline">
              <a href="/api/youtube/connect">YouTube 연결</a>
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="create">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="create">새 영상</TabsTrigger>
          <TabsTrigger value="jobs">
            작업 현황{activeCount > 0 ? ` (${activeCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="schedules">예약·반복</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateWizard />
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <JobList jobs={jobs.data ?? []} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <SchedulePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── 새 영상 위저드 ─────────────────────────────────────────────────────── */

function CreateWizard() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createVideoJobs);
  const callSuggest = useServerFn(suggestVideoTopics);

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
  const [privacy, setPrivacy] = useState<VideoJobConfig["privacy"]>("unlisted");
  const [courseLink, setCourseLink] = useState("none");
  const [newCourseTitle, setNewCourseTitle] = useState("");

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
            courseId:
              courseLink !== "none" && courseLink !== "__new__" ? courseLink : null,
            newCourseTitle:
              courseLink === "__new__" ? newCourseTitle.trim() : undefined,
          },
        },
      }),
    onSuccess: (r) => {
      toast.success(`영상 생성 작업 ${r.ids.length}건을 시작했어요. [작업 현황] 탭에서 확인하세요.`);
      qc.invalidateQueries({ queryKey: ["video-jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "생성 실패"),
  });

  const voices = VOICES[language];

  return (
    <div className="glass rounded-3xl p-6 space-y-5">
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
            ⑧ 자막 영상에 새기기
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
              <SelectItem value="unlisted">일부 공개 (권장 — 학습 페이지 재생 가능)</SelectItem>
              <SelectItem value="private">비공개 (본인만 재생 가능)</SelectItem>
              <SelectItem value="public">공개</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <CourseLinkSelect
        courseLink={courseLink}
        setCourseLink={setCourseLink}
        newCourseTitle={newCourseTitle}
        setNewCourseTitle={setNewCourseTitle}
      />

      <p className="text-xs text-muted-foreground">
        💡 비공개(private) 영상은 YouTube 정책상 학습 페이지에서 다른 사람이 재생할 수
        없어요. 학습 콘텐츠용은 <b>일부 공개(unlisted)</b>를 권장합니다.
      </p>

      <Button
        className="w-full md:w-auto"
        disabled={createMut.isPending}
        onClick={() => {
          if (!keyword.trim()) return toast.error("키워드를 입력하세요.");
          if (!topic.trim()) return toast.error("주제를 입력하거나 추천받으세요.");
          if (courseLink === "__new__" && !newCourseTitle.trim())
            return toast.error("새 강의 제목을 입력하세요.");
          createMut.mutate();
        }}
      >
        {createMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        🎬 영상 생성 시작
      </Button>
    </div>
  );
}

/* ── 작업 현황 (컴팩트 리스트) ─────────────────────────────────────────── */

function JobList({ jobs }: { jobs: VideoJob[] }) {
  const qc = useQueryClient();
  const callApprove = useServerFn(approveVideoUpload);
  const callRetry = useServerFn(retryVideoJob);
  const callDelete = useServerFn(deleteVideoJob);
  const [expanded, setExpanded] = useState<string | null>(null);

  function act(fn: (a: { data: { id: string } }) => Promise<unknown>, id: string) {
    fn({ data: { id } })
      .then(() => qc.invalidateQueries({ queryKey: ["video-jobs"] }))
      .catch((e) => toast.error(e instanceof Error ? e.message : "오류"));
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground glass rounded-3xl p-6">
        아직 생성한 영상이 없어요. [새 영상] 탭에서 시작해보세요.
      </p>
    );
  }

  return (
    <ul className="glass rounded-3xl divide-y divide-border/50 overflow-hidden">
      {jobs.map((j) => {
        const cfg = j.config as { topic?: string; keyword?: string };
        const script = j.script as { title?: string } | null;
        const meta = STATUS_META[j.status] ?? { label: j.status, cls: "bg-muted" };
        const busy = ["queued", "running", "uploading"].includes(j.status);
        const open = expanded === j.id;
        const title = script?.title || cfg.topic || cfg.keyword || "생성 중";

        return (
          <li key={j.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {j.thumbnail_path ? (
                <img
                  src={`/media/${j.thumbnail_path}`}
                  alt=""
                  className="w-16 h-9 rounded-lg object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-16 h-9 rounded-lg bg-white/50 border border-border grid place-items-center shrink-0">
                  <Clapperboard className="size-4 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("ko-KR", {
                    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                  {busy && ` · ${j.step}`}
                </div>
                {busy && (
                  <div className="h-1.5 mt-1 rounded-full bg-white/60 overflow-hidden max-w-[240px]">
                    <div
                      className="h-full gradient-primary transition-all"
                      style={{ width: `${j.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${meta.cls}`}
              >
                {meta.label}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {j.status === "awaiting_approval" && (
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => act(callApprove, j.id)}>
                    <Upload className="size-3.5 mr-1" /> 승인
                  </Button>
                )}
                {j.status === "failed" && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => act(callRetry, j.id)}>
                    <RefreshCcw className="size-3.5" />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : j.id)}
                  className="p-1.5 rounded-lg hover:bg-white/50 text-muted-foreground"
                  aria-label="상세 보기"
                >
                  <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {open && (
              <div className="mt-3 ml-19 pl-0 md:pl-19 space-y-2">
                {j.error && (
                  <p className="text-xs text-red-600 whitespace-pre-wrap">{j.error}</p>
                )}
                {j.video_path && (
                  <video
                    src={`/media/${j.video_path}`}
                    controls
                    preload="metadata"
                    className="w-full max-w-md rounded-xl border border-border"
                  />
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {j.youtube_video_id && (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={`https://www.youtube.com/watch?v=${j.youtube_video_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Youtube className="size-4" /> YouTube
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  {j.drama_id && (
                    <Link
                      to="/dramas/$id"
                      params={{ id: j.drama_id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Clapperboard className="size-4" /> 학습 콘텐츠
                    </Link>
                  )}
                  {j.lesson_id && (
                    <Link
                      to="/lessons/$id"
                      params={{ id: j.lesson_id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      📚 강의 열기
                    </Link>
                  )}
                  {!busy && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => act(callDelete, j.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" /> 삭제
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── 예약·반복 ─────────────────────────────────────────────────────────── */

function SchedulePanel() {
  const qc = useQueryClient();
  const callList = useServerFn(listVideoSchedules);
  const callCreate = useServerFn(createVideoSchedule);
  const callToggle = useServerFn(toggleVideoSchedule);
  const callDelete = useServerFn(deleteVideoSchedule);
  const callRunNow = useServerFn(runVideoScheduleNow);

  const schedules = useQuery({
    queryKey: ["video-schedules"],
    queryFn: () => callList({}),
  });

  const [name, setName] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([1, 4]);
  const [timeKst, setTimeKst] = useState("09:00");
  const [lengthSeconds, setLengthSeconds] = useState(60);
  const [language, setLanguage] = useState<VideoLanguage>("ko");
  const [focus, setFocus] = useState<VideoFocus>("culture");
  const [uploadMode, setUploadMode] =
    useState<VideoJobConfig["uploadMode"]>("auto");
  const [privacy, setPrivacy] = useState<VideoJobConfig["privacy"]>("unlisted");
  const [courseLink, setCourseLink] = useState("none");
  const [newCourseTitle, setNewCourseTitle] = useState("");

  const createMut = useMutation({
    mutationFn: () => {
      const keywords = keywordsRaw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      return callCreate({
        data: {
          name: name.trim(),
          keywords,
          frequency,
          weekdays: frequency === "weekly" ? weekdays : [],
          time_kst: timeKst,
          config: {
            audience: "중국어 입문 성인 학습자",
            lengthSeconds,
            language,
            focus,
            resolution: "1280x720",
            clipCount: 6,
            voice: VOICES[language][0].value,
            burnSubtitles: true,
            uploadMode,
            privacy,
            courseId:
              courseLink !== "none" && courseLink !== "__new__" ? courseLink : null,
            newCourseTitle:
              courseLink === "__new__" ? newCourseTitle.trim() : undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("예약을 등록했어요.");
      setName("");
      setKeywordsRaw("");
      qc.invalidateQueries({ queryKey: ["video-schedules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "등록 실패"),
  });

  function toggleWeekday(d: number) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  return (
    <div className="space-y-5">
      {/* 등록 폼 */}
      <div className="glass rounded-3xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <CalendarClock className="size-4" /> 새 예약 만들기
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>예약 이름 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 주 2회 문화 영상"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label>실행 시간 (한국 시간) *</Label>
            <Input
              type="time"
              value={timeKst}
              onChange={(e) => setTimeKst(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>키워드 목록 * (줄바꿈/쉼표 구분 — 실행마다 하나씩 순환, 주제는 AI가 자동 선정)</Label>
          <Textarea
            value={keywordsRaw}
            onChange={(e) => setKeywordsRaw(e.target.value)}
            placeholder={"중국 길거리 음식\n중국 명절\n중국 지하철 이용"}
            rows={3}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>반복 주기</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as "daily" | "weekly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">매일</SelectItem>
                <SelectItem value="weekly">매주 (요일 선택)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>요일 {frequency === "daily" && "(매일 실행 — 선택 불필요)"}</Label>
            <div className="flex gap-1.5">
              {WEEKDAY_LABELS.map((w, d) => (
                <button
                  key={d}
                  type="button"
                  disabled={frequency === "daily"}
                  onClick={() => toggleWeekday(d)}
                  className={[
                    "size-9 rounded-xl text-sm font-medium border transition disabled:opacity-40",
                    frequency === "weekly" && weekdays.includes(d)
                      ? "gradient-primary text-primary-foreground border-transparent"
                      : "bg-white/60 border-border hover:bg-white",
                  ].join(" ")}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>영상 길이</Label>
            <Select value={String(lengthSeconds)} onValueChange={(v) => setLengthSeconds(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LENGTHS.map((l) => (
                  <SelectItem key={l.value} value={String(l.value)}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>언어</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as VideoLanguage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어</SelectItem>
                <SelectItem value="zh">중국어</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>중점</Label>
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
            <Label>업로드 / 공개</Label>
            <div className="flex gap-2">
              <Select value={uploadMode} onValueChange={(v) => setUploadMode(v as VideoJobConfig["uploadMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">자동</SelectItem>
                  <SelectItem value="approval">승인</SelectItem>
                </SelectContent>
              </Select>
              <Select value={privacy} onValueChange={(v) => setPrivacy(v as VideoJobConfig["privacy"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unlisted">일부공개</SelectItem>
                  <SelectItem value="private">비공개</SelectItem>
                  <SelectItem value="public">공개</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <CourseLinkSelect
          courseLink={courseLink}
          setCourseLink={setCourseLink}
          newCourseTitle={newCourseTitle}
          setNewCourseTitle={setNewCourseTitle}
        />

        <Button
          disabled={createMut.isPending}
          onClick={() => {
            if (!name.trim()) return toast.error("예약 이름을 입력하세요.");
            if (!keywordsRaw.trim()) return toast.error("키워드를 입력하세요.");
            if (frequency === "weekly" && weekdays.length === 0)
              return toast.error("요일을 선택하세요.");
            if (courseLink === "__new__" && !newCourseTitle.trim())
              return toast.error("새 강의 제목을 입력하세요.");
            createMut.mutate();
          }}
        >
          {createMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          예약 등록
        </Button>
      </div>

      {/* 예약 목록 */}
      <div className="space-y-2">
        {(schedules.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">등록된 예약이 없어요.</p>
        )}
        <ul className="space-y-2">
          {(schedules.data ?? []).map((s: VideoSchedule) => (
            <li key={s.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) =>
                  callToggle({ data: { id: s.id, enabled: v } })
                    .then(() => qc.invalidateQueries({ queryKey: ["video-schedules"] }))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "오류"))
                }
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.frequency === "daily"
                    ? "매일"
                    : `매주 ${(s.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join("·")}`}{" "}
                  {s.time_kst} · 키워드 {s.keywords.length}개 순환
                  {s.last_run_at &&
                    ` · 마지막 실행 ${new Date(s.last_run_at).toLocaleDateString("ko-KR")}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  callRunNow({ data: { id: s.id } })
                    .then(() => {
                      toast.success("지금 실행했어요 — [작업 현황]에서 확인하세요.");
                      qc.invalidateQueries({ queryKey: ["video-jobs"] });
                      qc.invalidateQueries({ queryKey: ["video-schedules"] });
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "실행 실패"))
                }
              >
                <Play className="size-3.5 mr-1" /> 지금 실행
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() =>
                  callDelete({ data: { id: s.id } })
                    .then(() => qc.invalidateQueries({ queryKey: ["video-schedules"] }))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "삭제 실패"))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
