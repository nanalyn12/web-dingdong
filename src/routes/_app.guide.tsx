import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AlertTriangle, BookMarked, Clock, Compass, CreditCard, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMyProfile, useSession } from "@/lib/auth-client";
import { runTour } from "@/lib/coachmark";
import { guidesFor, type GuideTour, type TeacherGuide } from "@/lib/teacher-guide";
import { consoleTourSteps, coursesTourSteps } from "@/lib/tour-steps";

export const Route = createFileRoute("/_app/guide")({
  head: () => ({ meta: [{ title: "가이드 — DingDong" }] }),
  component: GuidePage,
});

const TOUR_STEPS: Record<GuideTour, typeof consoleTourSteps> = {
  console: consoleTourSteps,
  courses: coursesTourSteps,
};

function GuidePage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { data: profile, isLoading: pLoading } = useMyProfile();
  const guides = guidesFor(profile?.role);

  useEffect(() => {
    if (loading || pLoading) return;
    if (!session) navigate({ to: "/auth", search: { redirect: "/guide" } });
  }, [loading, pLoading, session, navigate]);

  if (loading || pLoading) {
    return <p className="text-muted-foreground px-2">불러오는 중…</p>;
  }

  if (session && guides.length === 0) {
    return (
      <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground">
        지금은 교수자·관리자용 가이드만 있어요.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="glass rounded-3xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl gradient-primary grid place-items-center text-primary-foreground">
            <BookMarked className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">교수자 가이드</h1>
            <p className="text-sm text-muted-foreground">
              화면을 오가며 하는 일을 순서대로 정리했어요. 「」 안의 말은 화면에 보이는 버튼·항목
              이름이에요.
            </p>
          </div>
        </div>
        <nav aria-label="가이드 목차" className="flex flex-wrap gap-2">
          {guides.map((g, i) => (
            <a
              key={g.id}
              href={`#guide-${g.id}`}
              className="inline-flex min-h-11 items-center rounded-full bg-surface/60 border border-border px-3 text-sm hover:bg-surface transition md:min-h-9"
            >
              {i + 1}. {g.title}
            </a>
          ))}
        </nav>
      </header>

      {guides.map((g, i) => (
        <GuideSection key={g.id} guide={g} index={i + 1} />
      ))}
    </div>
  );
}

function GuideSection({ guide, index }: { guide: TeacherGuide; index: number }) {
  const navigate = useNavigate();

  async function openWithTour(tour: GuideTour) {
    await navigate({ to: guide.url });
    // The target screen renders after navigation settles; runTour drops any
    // step whose element is not in the DOM yet.
    setTimeout(() => runTour(tour, TOUR_STEPS[tour](), { force: true }), 700);
  }

  return (
    <section
      id={`guide-${guide.id}`}
      className="glass rounded-3xl p-4 sm:p-6 space-y-4 scroll-mt-24"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-bold">
          <span className="text-primary">{index}.</span> {guide.title}
        </h2>
        <p className="text-sm text-muted-foreground">{guide.summary}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Meta icon={<Clock className="size-4" />} label="소요 시간" text={guide.duration} />
        <Meta icon={<CreditCard className="size-4" />} label="비용" text={guide.cost} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">순서</h3>
        <ol className="space-y-2">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold">
                {i + 1}
              </span>
              <span>
                <Quoted text={step} />
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl bg-warning/8 border border-warning/30 p-3 sm:p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-warning">
          <AlertTriangle className="size-4" /> 자주 막히는 곳
        </h3>
        <ul className="space-y-1.5 text-sm leading-relaxed list-disc pl-5">
          {guide.pitfalls.map((p, i) => (
            <li key={i}>
              <Quoted text={p} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to={guide.url}>
            <ExternalLink className="size-4" /> 이 화면 열기
          </Link>
        </Button>
        {guide.tour && (
          <Button variant="outline" onClick={() => openWithTour(guide.tour!)}>
            <Compass className="size-4" /> 화면 둘러보기
          </Button>
        )}
        {guide.links?.map((l) => (
          <Button key={l.url} asChild variant="ghost">
            <Link to={l.url}>{l.label} →</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

function Meta({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-surface/60 border border-border p-3 text-sm">
      <div className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs">
        {icon} {label}
      </div>
      <p className="mt-1 leading-relaxed">{text}</p>
    </div>
  );
}

/** On-screen labels are quoted as 「…」 in the guide data; set them in bold. */
function Quoted({ text }: { text: string }) {
  const parts = text.split(/(「[^」]+」)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("「") ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
