import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, Phone, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useMyProfile, useSession } from "@/lib/auth-client";
import { decideTeacher, listPendingTeachers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "관리자 — DingDong" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { data: profile, isLoading: pLoading } = useMyProfile();
  const fetchPending = useServerFn(listPendingTeachers);
  const decide = useServerFn(decideTeacher);
  const qc = useQueryClient();

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (loading || pLoading) return;
    if (!session) navigate({ to: "/auth", search: { redirect: "/admin" } });
  }, [loading, pLoading, session, navigate]);

  const { data: pending, isLoading } = useQuery({
    queryKey: ["pending-teachers"],
    queryFn: () => fetchPending({}),
    enabled: !!isAdmin,
  });

  const mutation = useMutation({
    mutationFn: (v: { userId: string; decision: "approve" | "reject" }) =>
      decide({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.decision === "approve" ? "교사로 승인했어요." : "거절했어요.");
      qc.invalidateQueries({ queryKey: ["pending-teachers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "처리 실패"),
  });

  if (loading || pLoading) {
    return <p className="p-8 text-muted-foreground">불러오는 중…</p>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto">
        <section className="glass rounded-3xl p-8 text-center">
          <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
          <h1 className="mt-3 text-2xl font-bold">관리자 전용 페이지</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            이 페이지는 관리자만 접근할 수 있어요.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" /> 교사 승인 대기열
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          신청한 사용자를 검토하고 교사 권한을 승인하거나 거절하세요.
        </p>
      </header>

      <section className="glass rounded-3xl p-4">
        {isLoading && (
          <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>
        )}
        {pending && pending.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">
            대기 중인 신청이 없어요. 🎉
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {pending?.map((p) => (
            <PendingTeacherCard
              key={p.id}
              p={p}
              onDecide={(decision) => mutation.mutate({ userId: p.id, decision })}
              disabled={mutation.isPending}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

const JOB_LABEL: Record<string, string> = {
  high_school: "고등학생",
  university: "대학생",
  teacher: "교사",
  worker: "직장인",
  other: "기타",
};

type PendingRow = {
  id: string;
  nickname: string | null;
  real_name: string | null;
  job: string | null;
  learning_goal: string | null;
  phone: string | null;
  teacher_application_note: string | null;
  teacher_school: string | null;
  teacher_department: string | null;
  teacher_applied_at: string | null;
  created_at: string;
  email: string | null;
  auth_phone: string | null;
};

function PendingTeacherCard({
  p,
  onDecide,
  disabled,
}: {
  p: PendingRow;
  onDecide: (d: "approve" | "reject") => void;
  disabled: boolean;
}) {
  const [openNote, setOpenNote] = useState(false);
  const displayName = p.real_name || p.nickname || p.id.slice(0, 8);
  const phone = p.phone || p.auth_phone;
  const appliedAt = p.teacher_applied_at || p.created_at;
  const legacy =
    !p.teacher_school && !p.teacher_application_note && !p.phone;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} 복사됨`);
    } catch {
      toast.error("복사 실패");
    }
  }

  return (
    <li className="rounded-2xl bg-white/70 border border-border p-4 space-y-3">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{displayName}</span>
            {p.nickname && p.real_name && (
              <span className="text-xs text-muted-foreground">@{p.nickname}</span>
            )}
            {legacy && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                구버전 신청 · 정보 없음
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{p.email || "—"}</span>
              {p.email && (
                <button
                  type="button"
                  onClick={() => copy(p.email!, "이메일")}
                  className="text-muted-foreground/70 hover:text-primary"
                  aria-label="이메일 복사"
                >
                  <Copy className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5 shrink-0" />
              <span className="truncate">{phone || "—"}</span>
              {phone && (
                <button
                  type="button"
                  onClick={() => copy(phone, "전화번호")}
                  className="text-muted-foreground/70 hover:text-primary"
                  aria-label="전화번호 복사"
                >
                  <Copy className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {(p.teacher_school || p.teacher_department) && (
            <div className="flex items-center gap-2 text-sm text-foreground/90">
              <span className="font-medium">
                {p.teacher_school || "학교 미입력"}
              </span>
              {p.teacher_department && (
                <span className="text-muted-foreground">
                  · {p.teacher_department}
                </span>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {(p.job && JOB_LABEL[p.job]) || "직업 미입력"} ·{" "}
            {new Date(appliedAt).toLocaleString("ko-KR")}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => onDecide("approve")}
            disabled={disabled}
          >
            {disabled ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserCheck className="size-4" />
            )}
            승인
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide("reject")}
            disabled={disabled}
          >
            <UserX className="size-4" />
            거절
          </Button>
        </div>
      </div>

      {(p.teacher_application_note || p.learning_goal) && (
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setOpenNote((v) => !v)}
          >
            {openNote ? "신청 사유 접기 ▲" : "신청 사유 보기 ▼"}
          </button>
          {openNote && (
            <div className="mt-2 text-sm whitespace-pre-wrap text-foreground/90 bg-white/60 rounded-xl p-3 border border-border/60">
              {p.teacher_application_note || p.learning_goal}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
