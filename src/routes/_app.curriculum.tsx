import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsEditor, useMyProfile } from "@/lib/auth-client";
import { listCoursesWithLessons } from "@/lib/courses.functions";
import {
  generateCurriculum,
  listMyCurriculums,
  deleteCurriculum,
} from "@/lib/curriculum.functions";

export const Route = createFileRoute("/_app/curriculum")({
  head: () => ({
    meta: [
      { title: "수업 커리큘럼 생성기 — DingDong" },
      {
        name: "description",
        content: "학생 정보와 수업 조건을 입력하면 AI가 시간별 지도안을 만들어드립니다.",
      },
    ],
  }),
  component: CurriculumPage,
});

const GRADES = [
  "초등 1-2학년",
  "초등 3-4학년",
  "초등 5-6학년",
  "중학생",
  "고등학생",
  "대학생",
  "성인",
];
const DURATIONS = [30, 40, 45, 50, 60, 80, 90, 120];
const INTEREST_PRESETS = ["K-POP", "게임", "음식", "여행", "애니", "드라마", "스포츠", "IT"];
const ACTIVITY_PRESETS = ["게임", "역할극", "짝활동", "노래", "영상", "발표", "쓰기", "그리기"];

function CurriculumPage() {
  const { data: profile, isLoading: profLoading } = useMyProfile();
  const isEditor = useIsEditor();

  if (profLoading) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <Loader2 className="size-6 animate-spin mx-auto" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="glass rounded-3xl p-10 text-center space-y-3">
        <h1 className="text-2xl font-bold">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">
          커리큘럼 생성기는 교수자 및 관리자 전용입니다.
        </p>
        <Link to="/auth" className="underline">로그인 하러가기</Link>
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div className="glass rounded-3xl p-10 text-center space-y-3">
        <h1 className="text-2xl font-bold">교수자 전용 기능</h1>
        <p className="text-muted-foreground">
          이 페이지는 교수자 또는 관리자만 사용할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <CurriculumForm />
      <HistoryPanel />
    </div>
  );
}

function CurriculumForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const generate = useServerFn(generateCurriculum);

  const { data: coursesData } = useQuery({
    queryKey: ["sidebar-courses-with-lessons"],
    queryFn: () => listCoursesWithLessons(),
  });

  const [studentGrade, setStudentGrade] = useState<string>(GRADES[5]);
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [courseId, setCourseId] = useState<string>("");
  const [lessonId, setLessonId] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [activities, setActivities] = useState<string[]>(["게임", "짝활동"]);
  const [specialNotes, setSpecialNotes] = useState("");
  const [objectiveHint, setObjectiveHint] = useState("");

  const lessonsForCourse = useMemo(
    () => coursesData?.find((c) => c.id === courseId)?.lessons ?? [],
    [coursesData, courseId],
  );

  const m = useMutation({
    mutationFn: async () =>
      generate({
        data: {
          courseId: courseId || null,
          lessonId: lessonId || null,
          studentGrade,
          durationMinutes,
          interests,
          preferredActivities: activities,
          specialNotes,
          lessonObjectiveHint: objectiveHint,
        },
      }),
    onSuccess: (r) => {
      toast.success("커리큘럼이 생성되었어요!");
      qc.invalidateQueries({ queryKey: ["my-curriculums"] });
      navigate({ to: "/curriculum/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const addInterest = () => {
    const v = interestInput.trim();
    if (!v) return;
    if (!interests.includes(v)) setInterests([...interests, v]);
    setInterestInput("");
  };

  return (
    <section className="glass rounded-3xl p-6 lg:p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4" /> AI 커리큘럼 생성
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold mt-1">수업 커리큘럼 생성기</h1>
        <p className="text-sm text-muted-foreground mt-1">
          학생 정보와 조건을 입력하면 시간 블록별 지도안, 인터랙티브 활동, 유인물까지 한 번에!
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>학생 학년 / 연령</Label>
          <Select value={studentGrade} onValueChange={setStudentGrade}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>수업 시간</Label>
          <Select value={String(durationMinutes)} onValueChange={(v) => setDurationMinutes(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d}분</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>현재 진도 — 코스 (선택)</Label>
          <Select value={courseId || "none"} onValueChange={(v) => { setCourseId(v === "none" ? "" : v); setLessonId(""); }}>
            <SelectTrigger><SelectValue placeholder="선택 안 함" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안 함</SelectItem>
              {coursesData?.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>세부 강의 (선택)</Label>
          <Select
            value={lessonId || "none"}
            onValueChange={(v) => setLessonId(v === "none" ? "" : v)}
            disabled={!courseId || lessonsForCourse.length === 0}
          >
            <SelectTrigger><SelectValue placeholder={courseId ? "선택 안 함" : "코스 먼저"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안 함</SelectItem>
              {lessonsForCourse.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>학생 관심사</Label>
        <div className="flex gap-2 flex-wrap">
          {INTEREST_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggle(interests, p, setInterests)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                interests.includes(p)
                  ? "gradient-primary text-primary-foreground"
                  : "bg-white/50 hover:bg-white/70"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="직접 추가 (예: 축구, 요리)"
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInterest(); } }}
          />
          <Button type="button" variant="outline" onClick={addInterest}>추가</Button>
        </div>
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {interests.map((i) => (
              <span key={i} className="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded-full flex items-center gap-1">
                {i}
                <button onClick={() => setInterests(interests.filter((x) => x !== i))} className="hover:text-pink-950">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>선호 활동 (여러 개 선택 가능)</Label>
        <div className="flex gap-2 flex-wrap">
          {ACTIVITY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggle(activities, p, setActivities)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activities.includes(p)
                  ? "gradient-primary text-primary-foreground"
                  : "bg-white/50 hover:bg-white/70"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>수업 목표 힌트 (선택)</Label>
        <Input
          placeholder="예: 식당에서 주문하기, 자기 소개하기"
          value={objectiveHint}
          onChange={(e) => setObjectiveHint(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>특이사항</Label>
        <Textarea
          placeholder="예: 발음에 자신 없는 학생 많음 / 지난 수업에서 성조 어려워 함 / 외향적 성향"
          rows={3}
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
        />
      </div>

      <Button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="w-full h-12 text-base"
      >
        {m.isPending ? (
          <><Loader2 className="size-5 animate-spin" /> AI가 커리큘럼을 만드는 중… (30~60초)</>
        ) : (
          <><Wand2 className="size-5" /> AI로 커리큘럼 생성</>
        )}
      </Button>
    </section>
  );
}

function HistoryPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listMyCurriculums);
  const del = useServerFn(deleteCurriculum);

  const { data, isLoading } = useQuery({
    queryKey: ["my-curriculums"],
    queryFn: () => list({}),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제되었어요");
      qc.invalidateQueries({ queryKey: ["my-curriculums"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="glass rounded-3xl p-6 space-y-4 h-fit">
      <h2 className="text-lg font-bold">최근 커리큘럼</h2>
      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 생성된 커리큘럼이 없어요.</p>
      )}
      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white/50 p-3 flex items-start gap-2">
            <Link
              to="/curriculum/$id"
              params={{ id: c.id }}
              className="flex-1 min-w-0"
            >
              <div className="font-medium truncate">{c.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.student_grade} · {c.duration_minutes}분 · {new Date(c.created_at).toLocaleDateString("ko-KR")}
              </div>
            </Link>
            <button
              onClick={() => {
                if (confirm("삭제할까요?")) delM.mutate(c.id);
              }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
              aria-label="삭제"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
