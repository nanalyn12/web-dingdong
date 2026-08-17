import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsEditor, useSession } from "@/lib/auth-client";
import {
  API_KEY_PROVIDERS,
  API_KEY_PROVIDER_META,
  type ApiKeyProvider,
} from "@/lib/api-key-choice";
import {
  deleteMyApiKey,
  getMyAiSettings,
  saveMyApiKey,
  type ApiKeyState,
} from "@/lib/user-api-keys.functions";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "AI 설정 — DingDong" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const isEditor = useIsEditor();
  const callSettings = useServerFn(getMyAiSettings);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth", search: { redirect: "/settings" } });
  }, [loading, session, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-ai-settings"],
    queryFn: () => callSettings({}),
    enabled: !!session,
  });

  const usage = data?.assistant;

  // 편집 권한자에게만 의미 있는 키(Suno)는 학생에게 감춘다 — 학습송 생성 자체가
  // 편집자 전용이라 등록해도 쓸 데가 없다. 서버는 어차피 누구의 저장도 막지 않는다.
  const visibleProviders = API_KEY_PROVIDERS.filter(
    (provider) => isEditor || !API_KEY_PROVIDER_META[provider].editorOnly,
  );

  return (
    <div className="space-y-5">
      <header className="glass rounded-3xl p-6 flex items-center gap-3 flex-wrap">
        <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
          <KeyRound className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">AI 설정</h1>
          <p className="text-sm text-muted-foreground">
            기본적으로 플랫폼 공용 키로 동작하고 사용량 제한이 있어요. 본인 키를 등록하면 그 기능은
            본인 계정으로 청구되고 제한 없이 쓸 수 있어요.
          </p>
        </div>
      </header>

      {isLoading && <p className="text-muted-foreground px-2">불러오는 중…</p>}

      {usage && (
        <section className="glass rounded-3xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-semibold">오늘의 叮叮 대화</h2>
          </div>
          {usage.limit === null ? (
            <p className="text-sm text-muted-foreground">
              {usage.onOwnKey
                ? "본인 API 키로 동작 중이라 사용량 제한이 없어요. 요금은 Google 계정으로 직접 청구돼요."
                : "사용량 제한이 없는 계정이에요."}
              {usage.used > 0 && ` (오늘 ${usage.used}회 사용)`}
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{usage.used}</span>
                <span className="text-muted-foreground">/ {usage.limit}회</span>
              </div>
              <div className="h-2 rounded-full bg-white/40 overflow-hidden">
                <div
                  className="h-full gradient-primary transition-all"
                  style={{
                    width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">매일 자정(한국 시간)에 초기화돼요.</p>
            </>
          )}
        </section>
      )}

      {data &&
        visibleProviders.map((provider) => (
          <ApiKeyCard
            key={provider}
            provider={provider}
            state={data.keys.find((k) => k.provider === provider)}
          />
        ))}
    </div>
  );
}

/** 제공자 하나의 키 등록·삭제 카드. 문구는 전부 API_KEY_PROVIDER_META에서 오므로
 *  제공자를 추가해도 이 컴포넌트는 손댈 필요가 없다. */
function ApiKeyCard({ provider, state }: { provider: ApiKeyProvider; state?: ApiKeyState }) {
  const qc = useQueryClient();
  const callSave = useServerFn(saveMyApiKey);
  const callDelete = useServerFn(deleteMyApiKey);
  const [apiKey, setApiKey] = useState("");
  const meta = API_KEY_PROVIDER_META[provider];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-ai-settings"] });

  const save = useMutation({
    mutationFn: (key: string) => callSave({ data: { provider, apiKey: key } }),
    onSuccess: () => {
      setApiKey("");
      toast.success(`${meta.label} 키를 저장했어요. 이제 이 키로 동작해요.`);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "키를 저장하지 못했어요."),
  });

  const remove = useMutation({
    mutationFn: () => callDelete({ data: { provider } }),
    onSuccess: () => {
      toast.success(`${meta.label} 키를 삭제했어요. 이제 공용 키와 그 한도가 적용돼요.`);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "키를 삭제하지 못했어요."),
  });

  return (
    <section className="glass rounded-3xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold">내 {meta.label} API 키</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {meta.what}에 쓰여요. 키는 암호화해서 저장하고, 저장한 뒤에는 화면에 다시 표시되지 않아요.
        </p>
      </div>

      {state?.configured ? (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl bg-emerald-500/10 border border-emerald-400/40 p-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">
              등록됨 · 끝 4자리 <code className="font-mono">…{state.hint}</code>
            </div>
            <div className="text-xs text-muted-foreground">{meta.what}이(가) 이 키로 동작해요.</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Trash2 className="size-3.5 mr-1" />
            )}
            삭제
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (apiKey.trim()) save.mutate(apiKey.trim());
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder={meta.placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 min-w-[16rem] font-mono"
          />
          <Button type="submit" disabled={save.isPending || !apiKey.trim()}>
            {save.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
            저장
          </Button>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        💡 키는 {meta.issuerLabel}에서 발급받을 수 있어요. 사용량 요금은 본인 계정으로 청구돼요.
      </p>
    </section>
  );
}
