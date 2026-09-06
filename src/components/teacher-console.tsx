import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2 } from "lucide-react";

import { WidgetPanel } from "@/components/widget-panel";
import { consoleCardsFor, type ConsoleCard } from "@/lib/console-cards";
import { badgeFor, type ConsoleSummary } from "@/lib/console-summary";
import { getConsoleSummary } from "@/lib/console.functions";

/**
 * 교수자·관리자의 홈.
 *
 * 랜딩과 톤이 다른 것은 의도다. 랜딩은 "🥢 매일 한 입"의 정서로 학습자를
 * 부르는 화면이고 여기는 일하는 화면이라, 같은 이모지·그라디언트를 그대로
 * 가져오면 정보 밀도가 낮아진다. 대신 표면(`glass`)과 시맨틱 토큰은 그대로
 * 써서 다른 앱처럼 보이지도 않게 한다.
 *
 * 두 종류의 숫자가 시각적으로 갈라져 있다.
 * - **대기 큐**는 카드 위의 뱃지다. 내가 손대야 사라지는 것이고, 0이면 조용하다.
 * - **이번 달 실적**은 아래 별도 스트립이다. 회고지 할 일이 아니므로 뱃지와
 *   같은 시각 언어를 쓰지 않는다. 기간 라벨과 모수 문구를 달아 무엇을 센
 *   숫자인지 스스로 말하게 한다 — 교수자의 "12"와 관리자의 "12"는 다른 숫자다.
 */
export function TeacherConsole({ role, name }: { role: string | null | undefined; name?: string }) {
  const fetchSummary = useServerFn(getConsoleSummary);
  const { data: summary, isLoading } = useQuery({
    queryKey: ["console-summary"],
    queryFn: () => fetchSummary({}),
    staleTime: 30_000,
  });

  const cards = consoleCardsFor(role);

  return (
    <div className="flex flex-col gap-5">
      <header className="glass rounded-3xl p-4 sm:p-6" data-tour="console-header">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          {name ? `${name} 님, 오늘의 할 일` : "오늘의 할 일"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          손대야 사라지는 것만 숫자로 띄웠어요. 조용하면 밀린 일이 없다는 뜻이에요.
        </p>
      </header>

      <section
        className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        data-tour="console-cards"
      >
        {cards.map((card) => (
          <ConsoleCardTile key={card.id} card={card} summary={summary} loading={isLoading} />
        ))}
      </section>

      <MonthStrip summary={summary} loading={isLoading} />

      {/* 위젯 패널 — 사이드바가 없는 모바일에서만. 콘솔이 랜딩을 대체하면서
          폰을 쓰는 교수자만 오늘의 단어·복습 큐를 통째로 잃는 일이 없도록,
          랜딩에 있던 이 블록을 여기에도 남긴다. */}
      <div className="md:hidden">
        <WidgetPanel />
      </div>
    </div>
  );
}

function ConsoleCardTile({
  card,
  summary,
  loading,
}: {
  card: ConsoleCard;
  summary: ConsoleSummary | undefined;
  loading: boolean;
}) {
  const Icon = card.icon;
  // metric이 없는 카드(커리큘럼)와 값이 아직 안 온 카드를 구분한다. 서버가
  // 지운 값(교수자의 승인 대기 교사 수)도 여기서는 "없음"으로 떨어진다.
  const count = card.metric ? (summary?.[card.metric] ?? null) : null;
  const badge = badgeFor(count);

  return (
    <Link
      to={card.url}
      className="glass rounded-3xl p-4 sm:p-5 flex flex-col gap-3 hover:scale-[1.02] transition group min-h-[7.5rem]"
    >
      <div className="flex items-start gap-3">
        <div className="size-10 shrink-0 rounded-2xl bg-surface/60 grid place-items-center text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-base leading-tight">{card.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{card.description}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
      </div>

      <div className="mt-auto flex items-baseline gap-1.5 text-sm">
        {card.metric && loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : badge ? (
          <>
            <span
              className={
                badge.tone === "attention"
                  ? "text-xl font-extrabold text-warning"
                  : "text-xl font-extrabold text-muted-foreground"
              }
            >
              {badge.count}
            </span>
            <span className="text-xs text-muted-foreground">
              {badge.tone === "attention" ? card.metricLabel : "밀린 일 없음"}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">바로 가기</span>
        )}
      </div>
    </Link>
  );
}

/**
 * 이번 달 실적. 뱃지가 아니라 문장에 가까운 형태로 그린다 — 교수자가 "이번 달
 * 학습송 12"를 처리해야 할 일로 읽으면 안 되기 때문이다.
 */
function MonthStrip({
  summary,
  loading,
}: {
  summary: ConsoleSummary | undefined;
  loading: boolean;
}) {
  return (
    <section className="glass-soft rounded-3xl p-4 sm:p-5" data-tour="console-stats">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold">{summary?.monthLabel ?? "이번 달"}에 만든 것</h2>
        <span className="text-xs text-muted-foreground">
          {summary?.scope === "all" ? "전체 제작자 기준" : "내가 만든 것만"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 max-w-md">
        <MonthStat label="영상 학습" value={summary?.videosThisMonth} loading={loading} />
        <MonthStat label="학습송" value={summary?.songsThisMonth} loading={loading} />
      </dl>
    </section>
  );
}

function MonthStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface/50 px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-bold text-lg">
        {loading ? <Loader2 className="size-4 animate-spin" /> : (value ?? 0)}
      </dd>
    </div>
  );
}
