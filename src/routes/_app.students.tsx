import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flame, Users } from "lucide-react";

import { useMyProfile, useSession } from "@/lib/auth-client";
import { getStudentRoster, type StudentRow } from "@/lib/students.functions";

export const Route = createFileRoute("/_app/students")({
  head: () => ({ meta: [{ title: "학생 현황 — DingDong" }] }),
  component: StudentsPage,
});

type SortKey =
  | "daysIdle"
  | "streak"
  | "actions7d"
  | "vocabTotal"
  | "lessonsCompleted"
  | "quizAvgPct"
  | "name";

function StudentsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { data: profile, isLoading: pLoading } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const callRoster = useServerFn(getStudentRoster);

  useEffect(() => {
    if (loading || pLoading) return;
    if (!session) navigate({ to: "/auth", search: { redirect: "/students" } });
  }, [loading, pLoading, session, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["student-roster"],
    queryFn: () => callRoster({}),
    enabled: !!isEditor,
  });

  const [sort, setSort] = useState<SortKey>("daysIdle");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const rows = [...(data?.students ?? [])];
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      // nulls last regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [data, sort, asc]);

  if (!loading && !pLoading && session && !isEditor) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-muted-foreground">
        교수자(teacher/admin) 전용 페이지입니다.
      </div>
    );
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="glass rounded-3xl p-6 flex items-center gap-3">
        <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
          <Users className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">학생 현황</h1>
          <p className="text-sm text-muted-foreground">
            학습자의 활동을 한눈에 보고, 관심이 필요한 학생을 먼저 확인하세요.
          </p>
        </div>
      </header>

      {isLoading && <p className="text-muted-foreground px-2">불러오는 중…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="전체 학습자" value={data.summary.total} />
            <SummaryCard label="오늘 활동" value={data.summary.activeToday} tone="good" />
            <SummaryCard
              label="7일+ 미활동"
              value={data.summary.idle7dPlus}
              tone={data.summary.idle7dPlus > 0 ? "warn" : "default"}
            />
            <SummaryCard label="활동 기록 없음" value={data.summary.neverActive} />
          </div>

          {data.students.length === 0 ? (
            <div className="glass rounded-3xl p-10 text-center text-muted-foreground">
              아직 등록된 학생이 없어요.
            </div>
          ) : (
            <div className="glass rounded-3xl p-2 overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <Th label="학생" k="name" sort={sort} asc={asc} onClick={toggleSort} align="left" />
                    <Th label="마지막 활동" k="daysIdle" sort={sort} asc={asc} onClick={toggleSort} />
                    <Th label="스트릭" k="streak" sort={sort} asc={asc} onClick={toggleSort} />
                    <Th label="최근 7일" k="actions7d" sort={sort} asc={asc} onClick={toggleSort} />
                    <Th label="단어" k="vocabTotal" sort={sort} asc={asc} onClick={toggleSort} />
                    <Th label="완료 레슨" k="lessonsCompleted" sort={sort} asc={asc} onClick={toggleSort} />
                    <Th label="퀴즈 평균" k="quizAvgPct" sort={sort} asc={asc} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <StudentRowView key={s.id} s={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn";
}) {
  const cls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "good"
        ? "text-emerald-700"
        : "text-foreground";
  return (
    <div className="glass rounded-2xl p-4">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Th({
  label,
  k,
  sort,
  asc,
  onClick,
  align = "center",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
  align?: "left" | "center";
}) {
  const activeSort = sort === k;
  return (
    <th className={`px-3 py-2 font-semibold ${align === "left" ? "text-left" : "text-center"}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition ${activeSort ? "text-primary" : ""}`}
      >
        {label}
        {activeSort && <span className="text-[9px]">{asc ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function StudentRowView({ s }: { s: StudentRow }) {
  const idle = s.daysIdle;
  const idleLabel =
    idle == null
      ? "—"
      : idle === 0
        ? "오늘"
        : idle === 1
          ? "어제"
          : `${idle}일 전`;
  const idleCls =
    idle == null
      ? "text-muted-foreground/60"
      : idle >= 7
        ? "text-amber-700 font-semibold"
        : idle === 0
          ? "text-emerald-700"
          : "text-foreground";

  return (
    <tr className="border-t border-white/40 hover:bg-white/40 transition">
      <td className="px-3 py-2.5">
        <div className="font-medium flex items-center gap-1.5">
          {idle != null && idle >= 7 && (
            <AlertTriangle className="size-3.5 text-amber-600 shrink-0" />
          )}
          {s.name}
          {s.role === "teacher" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-700">
              교수자
            </span>
          )}
        </div>
        {s.email && (
          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
            {s.email}
          </div>
        )}
      </td>
      <td className={`px-3 py-2.5 text-center ${idleCls}`}>{idleLabel}</td>
      <td className="px-3 py-2.5 text-center">
        {s.streak > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            <Flame className="size-3.5 text-orange-500" />
            {s.streak}
          </span>
        ) : (
          <span className="text-muted-foreground/60">0</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">{s.actions7d}</td>
      <td className="px-3 py-2.5 text-center">{s.vocabTotal}</td>
      <td className="px-3 py-2.5 text-center">{s.lessonsCompleted}</td>
      <td className="px-3 py-2.5 text-center">
        {s.quizAvgPct == null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <span
            className={
              s.quizAvgPct >= 70 ? "text-emerald-700" : "text-amber-700"
            }
          >
            {s.quizAvgPct}%
          </span>
        )}
      </td>
    </tr>
  );
}
