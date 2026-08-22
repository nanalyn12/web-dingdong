import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMyProfile, useSession } from "@/lib/auth-client";
import {
  getIntegrationStatus,
  testIntegration,
  type IntegrationId,
  type IntegrationStatus,
  type TestResult,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/_app/integrations")({
  head: () => ({ meta: [{ title: "연동 상태 — DingDong" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { data: profile, isLoading: pLoading } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const callStatus = useServerFn(getIntegrationStatus);

  useEffect(() => {
    if (loading || pLoading) return;
    if (!session) navigate({ to: "/auth", search: { redirect: "/integrations" } });
  }, [loading, pLoading, session, navigate]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => callStatus({}),
    enabled: !!isEditor,
  });

  if (!loading && !pLoading && session && !isEditor) {
    return (
      <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground">
        교수자(teacher/admin) 전용 페이지입니다.
      </div>
    );
  }

  const missing = (data ?? []).filter((i) => !i.configured).length;

  return (
    <div className="space-y-5">
      <header className="glass rounded-3xl p-4 sm:p-6 flex items-center gap-3 flex-wrap">
        <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
          <Plug className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">연동 상태</h1>
          <p className="text-sm text-muted-foreground">
            외부 API가 제대로 연결돼 있는지 한눈에 확인하세요. 키 값은 저장·표시하지 않고 설정
            여부만 확인해요.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching && <Loader2 className="size-3.5 mr-1 animate-spin" />}
          새로고침
        </Button>
      </header>

      {isLoading && <p className="text-muted-foreground px-2">불러오는 중…</p>}

      {data && missing > 0 && (
        <div className="glass rounded-2xl p-4 border border-amber-400/40 bg-amber-500/5 text-sm">
          ⚠️ 설정되지 않은 연동이 <b>{missing}개</b> 있어요. 해당 기능은 동작하지 않거나 대체 경로로
          넘어가요.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((item) => (
          <IntegrationCard key={item.id} item={item} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground px-2">
        💡 API 키는 Railway 환경변수에서 관리해요. 키를 추가·변경하면 서비스가 재배포되어야
        반영됩니다.
      </p>
    </div>
  );
}

function IntegrationCard({ item }: { item: IntegrationStatus }) {
  const callTest = useServerFn(testIntegration);
  const [result, setResult] = useState<TestResult | null>(null);
  const test = useMutation({
    mutationFn: (id: IntegrationId) => callTest({ data: { id } }),
    onSuccess: (r) => setResult(r),
    onError: (e) =>
      setResult({ ok: false, message: e instanceof Error ? e.message : "테스트 실패" }),
  });

  return (
    <div className="glass rounded-2xl p-4 space-y-2">
      <div className="flex items-start gap-2">
        {item.configured ? (
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-2 flex-wrap">
            {item.label}
            <span
              className={[
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                item.configured
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-amber-500/15 text-amber-700",
              ].join(" ")}
            >
              {item.configured ? "설정됨" : "미설정"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.what}</p>
          {item.detail && <p className="text-[11px] text-muted-foreground mt-1">{item.detail}</p>}
        </div>
      </div>

      {item.testable && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button
            size="xs"
            variant="outline"
            className="px-2 text-xs"
            disabled={test.isPending}
            onClick={() => test.mutate(item.id)}
          >
            {test.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
            연결 테스트
          </Button>
          {result && (
            <span
              className={["text-xs", result.ok ? "text-emerald-700" : "text-destructive"].join(" ")}
            >
              {result.ok ? "✅" : "❌"} {result.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
