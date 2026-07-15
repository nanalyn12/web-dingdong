import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Brain,
  Film,
  Flame,
  GraduationCap,
  LogIn,
  Play,
  Sparkles,
} from "lucide-react";

import { getMyDashboard, type DashboardData } from "@/lib/dashboard.functions";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "학습 대시보드 — DingDong" },
      { name: "description", content: "복습, 스트릭, 진도를 한눈에 확인하세요." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useSession();
  const callGetDashboard = useServerFn(getMyDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => callGetDashboard(),
    enabled: !!session,
  });

  if (!session) {
    return (
      <section className="glass rounded-3xl p-10 text-center space-y-4">
        <div className="mx-auto size-14 rounded-3xl gradient-primary grid place-items-center text-primary-foreground">
          <Sparkles className="size-7" />
        </div>
        <h1 className="text-2xl font-bold">학습 대시보드</h1>
        <p className="text-muted-foreground">
          로그인하면 복습 큐, 연속 학습, 진도를 한눈에 볼 수 있어요.
        </p>
        <Button asChild className="rounded-2xl">
          <Link to="/auth">
            <LogIn className="size-4" /> 로그인하고 시작하기
          </Link>
        </Button>
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="glass rounded-3xl p-8">
        <p className="text-muted-foreground">대시보드를 불러오는 중…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">학습 대시보드</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            오늘도 딩동과 함께 조금씩, 꾸준히!
          </p>
        </div>
        <div
          className={[
            "flex items-center gap-2 rounded-2xl px-4 py-2.5 font-bold",
            data.streak > 0
              ? "bg-gradient-to-r from-orange-400 to-rose-500 text-white shadow-[var(--shadow-soft)]"
              : "bg-white/50 text-muted-foreground",
          ].join(" ")}
        >
          <Flame className="size-5" />
          {data.streak > 0 ? `${data.streak}일 연속 학습 중` : "오늘 첫 학습을 시작해보세요"}
        </div>
      </section>

      {/* 오늘 복습 CTA */}
      {data.todayDue > 0 && (
        <section className="glass rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 border border-primary/30">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
              <Brain className="size-5" />
            </div>
            <div>
              <div className="font-bold">
                오늘 복습할 단어 {data.todayDue}개가 기다리고 있어요
              </div>
              <div className="text-xs text-muted-foreground">
                SRS 복습은 하루 5분이면 충분해요.
              </div>
            </div>
          </div>
          <Button asChild className="rounded-2xl">
            <Link to="/vocabulary/review">
              <Play className="size-4" /> 지금 복습하기
            </Link>
          </Button>
        </section>
      )}

      {/* 통계 카드 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Brain className="size-4" />}
          label="오늘 복습"
          value={`${data.todayDue}개`}
          sub={data.todayDue > 0 ? "복습 대기 중" : "모두 완료! 🎉"}
        />
        <StatCard
          icon={<BookOpen className="size-4" />}
          label="내 단어장"
          value={`${data.vocabTotal}개`}
          sub={`최근 7일 +${data.vocabAdded7d}`}
        />
        <StatCard
          icon={<GraduationCap className="size-4" />}
          label="완료한 레슨"
          value={`${data.lessons.completed} / ${data.lessons.total}`}
          sub="퀴즈 70% 이상 통과 기준"
        />
        <StatCard
          icon={<Sparkles className="size-4" />}
          label="퀴즈 평균"
          value={data.quizAvgPct != null ? `${data.quizAvgPct}점` : "—"}
          sub={data.quizAvgPct != null ? "100점 만점 환산" : "아직 퀴즈 기록이 없어요"}
        />
      </section>

      {/* 활동 잔디 */}
      <section className="glass rounded-3xl p-6 space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <Flame className="size-4 text-primary" /> 최근 12주 학습 활동
        </h2>
        <ActivityGrass activity={data.activity} />
        <Last7Days activity={data.activity} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 이어보기 */}
        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <Film className="size-4 text-primary" /> 영상 학습 이어보기
          </h2>
          {data.continueWatching.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 시청 기록이 없어요.{" "}
              <Link to="/dramas" className="text-primary font-medium underline">
                영상 학습 보러 가기 →
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {data.continueWatching.map((w) => (
                <Link
                  key={w.drama_id}
                  to="/dramas/$id"
                  params={{ id: w.drama_id }}
                  className="flex items-center gap-3 rounded-2xl bg-white/50 hover:bg-white/80 transition p-2.5"
                >
                  {w.thumbnail_url ? (
                    <img
                      src={w.thumbnail_url}
                      alt=""
                      className="w-24 h-14 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-14 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                      <Film className="size-5 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{w.title}</div>
                    <ProgressBar
                      pct={watchPct(w)}
                      label={
                        w.total_scenes > 0
                          ? `장면 ${w.completed_scenes}/${w.total_scenes}`
                          : `${Math.floor(w.last_seconds / 60)}분 지점`
                      }
                    />
                  </div>
                  <Play className="size-4 text-primary shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 최근 레슨 */}
        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <GraduationCap className="size-4 text-primary" /> 최근 학습한 레슨
          </h2>
          {data.lessons.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 레슨 기록이 없어요.{" "}
              <Link to="/courses" className="text-primary font-medium underline">
                강의 보러 가기 →
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {data.lessons.recent.map((l) => (
                <Link
                  key={l.lesson_id}
                  to="/lessons/$id"
                  params={{ id: l.lesson_id }}
                  className="flex items-center gap-3 rounded-2xl bg-white/50 hover:bg-white/80 transition p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{l.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      학습 탭 {l.tabs_done}개 완료
                      {l.quiz_total
                        ? ` · 퀴즈 ${l.quiz_correct}/${l.quiz_total}`
                        : ""}
                    </div>
                  </div>
                  {l.completed ? (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold shrink-0">
                      ✅ 완료
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold shrink-0">
                      ⏳ 진행중
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* HSK 분포 */}
      {data.vocabTotal > 0 && (
        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> 단어장 HSK 분포
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.vocabByHsk)
              .sort(([a], [b]) => a.localeCompare(b, "ko"))
              .map(([k, n]) => (
                <span
                  key={k}
                  className="rounded-full bg-white/60 border border-border px-3 py-1 text-xs font-medium"
                >
                  {k === "기타" ? "기타" : `HSK ${k}급`}{" "}
                  <b className="text-primary">{n}</b>
                </span>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function grassColor(total: number): string {
  if (total <= 0) return "bg-black/[0.06]";
  if (total <= 2) return "bg-emerald-200";
  if (total <= 5) return "bg-emerald-400";
  return "bg-emerald-600";
}

function ActivityGrass({ activity }: { activity: DashboardData["activity"] }) {
  // activity is oldest→newest, 84 entries. Pad the first column so rows align
  // to weekdays (Sunday at the top, like GitHub's graph).
  const lead = activity.length
    ? new Date(`${activity[0].date}T12:00:00+09:00`).getDay()
    : 0;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid grid-rows-7 grid-flow-col gap-1 w-max">
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`pad-${i}`} className="size-3.5" />
        ))}
        {activity.map((d) => (
          <div
            key={d.date}
            title={`${d.date} · 활동 ${d.total}회`}
            className={`size-3.5 rounded-[4px] ${grassColor(d.total)}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
        적음
        <span className="size-2.5 rounded-[3px] bg-black/[0.06]" />
        <span className="size-2.5 rounded-[3px] bg-emerald-200" />
        <span className="size-2.5 rounded-[3px] bg-emerald-400" />
        <span className="size-2.5 rounded-[3px] bg-emerald-600" />
        많음
      </div>
    </div>
  );
}

const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

function Last7Days({ activity }: { activity: DashboardData["activity"] }) {
  const last7 = activity.slice(-7);
  const max = Math.max(1, ...last7.map((d) => d.total));
  return (
    <div className="grid grid-cols-7 gap-2 pt-2">
      {last7.map((d) => {
        const day = new Date(`${d.date}T12:00:00+09:00`).getDay();
        return (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <div className="h-16 w-full max-w-8 flex items-end">
              <div
                className={`w-full rounded-lg ${d.total > 0 ? "gradient-primary" : "bg-black/[0.06]"}`}
                style={{ height: `${Math.max(8, (d.total / max) * 100)}%` }}
                title={`${d.date} · ${d.total}회`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {DAY_LABEL[day]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
        <div
          className="h-full rounded-full gradient-primary"
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function watchPct(w: DashboardData["continueWatching"][number]): number {
  if (w.total_scenes > 0) return (w.completed_scenes / w.total_scenes) * 100;
  if (w.duration_seconds) return (w.last_seconds / w.duration_seconds) * 100;
  return 0;
}
