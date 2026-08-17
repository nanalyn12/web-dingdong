import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  MessageCircleHeart,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

import { runTour } from "@/lib/coachmark";
import { landingTourSteps } from "@/lib/tour-steps";
import { COURSE_CATEGORIES } from "@/lib/course-categories";

import heroDingdong from "@/assets/hero-dingdong.png";
import { listCoursesWithCounts } from "@/lib/courses.functions";
import { WidgetPanel } from "@/components/widget-panel";
import { LEVEL_HSK, LEVEL_LABEL } from "@/lib/levels";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "DingDong — AI로 배우는 중국어" },
      {
        name: "description",
        content:
          "한국인 성인 학습자를 위한 AI 기반 중국어 학습 플랫폼 DingDong. 맞춤형 강의, 실전 회화, HSK 대비까지 한 입씩 가볍게.",
      },
      { property: "og:title", content: "DingDong — AI로 배우는 중국어" },
      {
        property: "og:description",
        content: "AI가 만드는 맞춤형 중국어 강의와 단어장. 매일 한 입씩, 즐겁게.",
      },
    ],
  }),
  component: Landing,
});

const LEVEL_META: Record<string, { label: string; emoji: string; chip: string }> = {
  beginner: {
    label: `${LEVEL_LABEL.beginner} · ${LEVEL_HSK.beginner}`,
    emoji: "🌱",
    chip: "bg-mint/60",
  },
  intermediate: {
    label: `${LEVEL_LABEL.intermediate} · ${LEVEL_HSK.intermediate}`,
    emoji: "🌿",
    chip: "bg-sky/60",
  },
  advanced: {
    label: `${LEVEL_LABEL.advanced} · ${LEVEL_HSK.advanced}`,
    emoji: "🌳",
    chip: "bg-lavender/60",
  },
};

function Landing() {
  const { data: courses } = useQuery({
    queryKey: ["courses-with-counts"],
    queryFn: () => listCoursesWithCounts(),
  });

  const totalCourses = courses?.length ?? 0;
  const totalLessons = courses?.reduce((sum, c) => sum + (c.lesson_count ?? 0), 0) ?? 0;
  const featured = (courses ?? []).slice(0, 6);

  useEffect(() => {
    const t = setTimeout(() => runTour("landing", landingTourSteps()), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* 위젯 패널 — 사이드바가 없는 모바일에서만 홈 상단에 표시 */}
      <div className="md:hidden">
        <WidgetPanel />
      </div>

      {/* HERO */}
      <section data-tour="hero" className="glass rounded-4xl p-8 md:p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-pink/60 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-80 rounded-full bg-sky/60 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 size-72 rounded-full bg-lavender/40 blur-3xl" />

        <div className="relative grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full glass-soft px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3.5" /> 叮叮과 함께 배우는 AI 중국어
            </div>
            <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              띵동! <span className="inline-block">🛎️</span>
              <br />
              <span className="text-gradient-primary">오늘도 중국어 한 입.</span>
            </h1>
            <p className="mt-5 max-w-xl text-muted-foreground text-base md:text-lg">
              한국인 성인 학습자를 위해 설계된 맞춤형 강의 · 실전 회화 · HSK 대비까지. AI가 당신의
              속도에 맞춰 매일 한 조각씩 떠먹여 드려요. 🥢
            </p>

            <div className="mt-7 flex flex-wrap gap-3" data-tour="hero-cta">
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 rounded-2xl gradient-primary text-primary-foreground px-5 py-3 text-sm font-semibold shadow-[var(--shadow-soft)] hover:opacity-90 transition"
              >
                <GraduationCap className="size-4" />
                강의 둘러보기
              </Link>

              <Link
                to="/vocabulary"
                className="inline-flex items-center gap-2 rounded-2xl glass-soft px-5 py-3 text-sm font-semibold hover:bg-white/60 transition"
              >
                <BookOpen className="size-4" />내 단어장
              </Link>
            </div>

            <dl className="mt-8 grid grid-cols-3 gap-3 max-w-md">
              <Stat emoji="📚" label="강의" value={totalCourses} />
              <Stat emoji="✏️" label="세부 강의" value={totalLessons} />
              <Stat emoji="🎯" label="HSK" value="1~9급" />
            </dl>
          </div>

          <div className="relative hidden md:block">
            <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-br from-pink/40 via-lavender/30 to-sky/40 blur-2xl" />
            <img
              src={heroDingdong}
              alt="DingDong 마스코트 叮叮"
              width={1024}
              height={1024}
              className="relative w-full max-w-sm mx-auto drop-shadow-[0_20px_40px_rgba(180,120,200,0.25)]"
            />
          </div>
        </div>
      </section>

      {/* CATEGORY EMOJI CARDS */}
      <section className="space-y-4" data-tour="categories">
        <SectionHeader
          eyebrow="🍽️ 메뉴판"
          title="어떤 한 입이 땡기세요?"
          subtitle="관심사로 시작해 보세요. 카테고리별로 맞춤 강의를 추천해 드려요."
        />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* These used to be six identical links to the unfiltered course
              list, under a heading promising per-category recommendations. */}
          {COURSE_CATEGORIES.map((cat) => (
            <Link
              key={cat.key}
              to="/courses"
              search={{ cat: cat.key }}
              className="glass-soft rounded-3xl p-5 text-center hover:scale-[1.03] hover:bg-white/60 transition group"
            >
              <div
                className={`size-14 mx-auto rounded-2xl ${cat.chip} grid place-items-center text-3xl mb-3 group-hover:scale-110 transition`}
              >
                {cat.emoji}
              </div>
              <div className="font-semibold text-sm">{cat.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED COURSES (dynamic) */}
      <section className="space-y-4" data-tour="featured">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <SectionHeader
            eyebrow="🔥 새로 나온 강의"
            title="지금 떠먹어볼 만한 강의"
            subtitle="AI 叮叮이 막 구워낸 따끈따끈한 강의들이에요."
          />
          <Link
            to="/courses"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80"
          >
            전체 보기 <ArrowRight className="size-4" />
          </Link>
        </div>

        {featured.length === 0 ? (
          <EmptyCourses />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => {
              const meta = LEVEL_META[c.level] ?? LEVEL_META.beginner;
              const accents = ["bg-pink/50", "bg-sky/50", "bg-mint/50", "bg-lavender/50"];
              return (
                <Link
                  key={c.id}
                  to="/courses/$id"
                  params={{ id: c.id }}
                  className="glass rounded-3xl p-6 hover:scale-[1.02] transition group"
                >
                  <div
                    className={`size-14 rounded-2xl ${accents[i % accents.length]} grid place-items-center text-3xl mb-4 group-hover:rotate-6 transition`}
                  >
                    {meta.emoji}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-primary/15 text-primary px-2 py-0.5">
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      세부 강의 {c.lesson_count}개
                    </span>
                  </div>
                  <h3 className="font-bold text-lg line-clamp-1">{c.title}</h3>
                  {c.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {c.description}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* LEVEL PATH */}
      <section className="space-y-4" data-tour="level-path">
        <SectionHeader
          eyebrow="🗺️ 학습 지도"
          title="단계별로 천천히, 그리고 꾸준히"
          subtitle="DingDong의 3단계 코스로 HSK 9급까지 함께 가요."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              k: "beginner",
              title: LEVEL_LABEL.beginner,
              hsk: LEVEL_HSK.beginner,
              emoji: "🌱",
              c: "bg-mint/60",
              desc: "한어병음과 기본 인사부터. 자기소개와 일상 표현까지.",
            },
            {
              k: "intermediate",
              title: LEVEL_LABEL.intermediate,
              hsk: LEVEL_HSK.intermediate,
              emoji: "🌿",
              c: "bg-sky/60",
              desc: "실전 대화와 뉴스·드라마. 자유 회화의 자신감 단계.",
            },
            {
              k: "advanced",
              title: LEVEL_LABEL.advanced,
              hsk: LEVEL_HSK.advanced,
              emoji: "🌳",
              c: "bg-lavender/60",
              desc: "전문 어휘와 비즈니스. 원어민 수준의 표현 다루기.",
            },
          ].map((lv) => (
            <div key={lv.k} className="glass rounded-3xl p-6">
              <div className={`size-16 rounded-2xl ${lv.c} grid place-items-center text-4xl mb-4`}>
                {lv.emoji}
              </div>
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold text-xl">{lv.title}</h3>
                <span className="text-xs text-muted-foreground">{lv.hsk}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{lv.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY DINGDONG */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            i: <Sparkles className="size-5" />,
            t: "AI 맞춤 큐레이션",
            d: "당신의 수준·관심사에 맞춰 叮叮이 매일 새로운 한 입을 준비해요.",
            c: "bg-pink/50",
            e: "✨",
          },
          {
            i: <MessageCircleHeart className="size-5" />,
            t: "실전 회화 중심",
            d: "교과서가 아니라 실제로 쓰는 표현. 병음과 한글로 친절하게.",
            c: "bg-mint/50",
            e: "💬",
          },
          {
            i: <Trophy className="size-5" />,
            t: "HSK 1~9급 대비",
            d: "목표 급수에 맞춘 어휘·문법·듣기까지 한 곳에서.",
            c: "bg-lavender/50",
            e: "🏆",
          },
        ].map((f) => (
          <div key={f.t} className="glass rounded-3xl p-6">
            <div className={`size-12 rounded-2xl ${f.c} grid place-items-center text-2xl mb-3`}>
              {f.e}
            </div>
            <div className="flex items-center gap-2 font-semibold">
              {f.i}
              {f.t}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{f.d}</div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="glass rounded-4xl p-8 md:p-10 relative overflow-hidden">
        <div className="absolute -top-16 right-10 size-56 rounded-full bg-pink/50 blur-3xl" />
        <div className="absolute -bottom-20 left-10 size-56 rounded-full bg-mint/50 blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full glass-soft px-3 py-1 text-xs font-medium">
              <Target className="size-3.5" /> 오늘부터 시작
            </div>
            <h2 className="mt-3 text-2xl md:text-3xl font-extrabold">
              你好! 첫 강의로 입을 풀어볼까요? 🥟
            </h2>
            <p className="mt-2 text-muted-foreground max-w-xl">
              가입은 무료, 강의 보기도 무료. 마음에 들면 단어장에 차곡차곡 모아두세요.
            </p>
          </div>
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 rounded-2xl gradient-primary text-primary-foreground px-6 py-3.5 text-sm font-semibold shadow-[var(--shadow-soft)] hover:opacity-90 transition whitespace-nowrap"
          >
            지금 시작하기 <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ emoji, label, value }: { emoji: string; label: string; value: number | string }) {
  return (
    <div className="glass-soft rounded-2xl px-3 py-2.5">
      <div className="text-lg">{emoji}</div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-bold text-base">{value}</dd>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-primary mb-1">{eyebrow}</div>
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function EmptyCourses() {
  return (
    <div className="glass-soft rounded-3xl p-10 text-center">
      <div className="text-5xl mb-3">🍳</div>
      <h3 className="font-bold text-lg">아직 준비된 강의가 없어요</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        叮叮이 지금 강의를 굽고 있어요. 곧 따끈한 첫 강의를 만나보실 수 있어요!
      </p>
      <Link
        to="/courses"
        className="mt-5 inline-flex items-center gap-2 rounded-2xl glass px-4 py-2 text-sm font-medium hover:bg-white/60 transition"
      >
        강의 페이지로 이동 <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
