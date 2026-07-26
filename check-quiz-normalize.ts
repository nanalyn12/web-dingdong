// How many stored quiz items src/lib/quiz-normalize.ts can still render.
//
// Lessons generated before the quiz shape was pinned down stored each item
// under whatever keys that run invented, and the lesson page repairs them on
// read. This reports what that repair recovers against the live database, so a
// change to the normalizer can be measured instead of guessed at.
//
//   npx tsx --env-file=.env check-quiz-normalize.ts [flags]
//
//   --audit          re-check every resolved answer against what the model
//                    wrote (a wrong `correct` is worse than a dropped item)
//   --show-dropped   print the items that could not be recovered
//   --type=order     with --show-dropped, only that quiz type
//
// Read-only: it never writes to the database.
import { Client } from "pg";

import { normalizeQuizItem } from "./src/lib/quiz-normalize";

const showDropped = process.argv.includes("--show-dropped");

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows } = await c.query(`
  select l.id, l.title, l.lesson_type, q, ord
    from lessons l, lateral jsonb_array_elements(coalesce(l.quiz,'[]'::jsonb)) with ordinality t(q, ord)`);

let ok = 0;
const dropped: { type: string; keys: string; item: unknown }[] = [];
const byType: Record<string, { in: number; out: number }> = {};

for (const r of rows) {
  const t = String((r.q as Record<string, unknown>)?.type ?? "(none)");
  byType[t] ??= { in: 0, out: 0 };
  byType[t].in++;
  const n = normalizeQuizItem(r.q);
  if (n) {
    ok++;
    byType[t].out++;
  } else {
    dropped.push({
      type: t,
      keys: Object.keys((r.q as object) ?? {})
        .sort()
        .join(","),
      item: r.q,
    });
  }
}

console.log(
  `전체 ${rows.length}문항 → 복구 ${ok} (${((ok / rows.length) * 100).toFixed(1)}%), 드롭 ${dropped.length}`,
);
console.log("\n유형별:");
console.table(
  Object.entries(byType).map(([type, v]) => ({
    type,
    in: v.in,
    out: v.out,
    pct: `${((v.out / v.in) * 100).toFixed(0)}%`,
  })),
);

if (dropped.length) {
  const shapes = new Map<string, number>();
  for (const d of dropped)
    shapes.set(`${d.type} :: ${d.keys}`, (shapes.get(`${d.type} :: ${d.keys}`) ?? 0) + 1);
  console.log("\n드롭된 shape:");
  [...shapes.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
  if (showDropped) {
    const only = process.argv.find((a) => a.startsWith("--type="))?.slice(7);
    const sel = only ? dropped.filter((d) => d.type.startsWith(only)) : dropped;
    console.log(`\n드롭 샘플 (${sel.length}건 중 앞 14건):`);
    sel
      .slice(0, 14)
      .forEach((d, i) =>
        console.log(`--- ${i + 1}\n` + JSON.stringify(d.item, null, 1).slice(0, 800) + "\n"),
      );
  }
}

// Per-lesson: how many lessons end up with a usable quiz?
const perLesson = new Map<string, { title: string; n: number }>();
for (const r of rows) {
  const e = perLesson.get(r.id) ?? { title: r.title, n: 0 };
  if (normalizeQuizItem(r.q)) e.n++;
  perLesson.set(r.id, e);
}
const empty = [...perLesson.values()].filter((v) => v.n === 0);
console.log(
  `\n퀴즈 보유 강의 ${perLesson.size}개 중, 정규화 후 0문항이 되는 강의: ${empty.length}`,
);
empty.slice(0, 20).forEach((v) => console.log(`  - ${v.title.slice(0, 50)}`));

// Audit: does the resolved answer still agree with what the model wrote?
// A wrong `correct` is worse than a dropped item, so these are printed in full.
if (process.argv.includes("--audit")) {
  const fold = (s: string) =>
    s
      .replace(/^\s*[A-Da-d]\s*[.)、．：:]\s*/, "")
      .replace(/\s/g, "")
      .toLowerCase();
  let checked = 0;
  let suspect = 0;
  for (const r of rows) {
    const o = r.q as Record<string, unknown>;
    const n = normalizeQuizItem(o);
    if (n?.type !== "choice") continue;
    const stated = [o.answer, o.answer_zh, o.ko_answer]
      .map((v) =>
        typeof v === "string"
          ? v
          : typeof v === "object" && v
            ? (v as Record<string, string>).zh
            : undefined,
      )
      .find((v) => typeof v === "string" && v.trim() && !/^[A-Da-d]$/.test(v.trim()));
    if (!stated) continue;
    checked++;
    const chosen = n.options[n.correct] ?? "";
    if (!fold(chosen).includes(fold(stated)) && !fold(stated).includes(fold(chosen))) {
      suspect++;
      if (suspect <= 12) {
        console.log(`\n[의심] 원본 answer="${stated}"  →  선택된 보기="${chosen}"`);
        console.log(`       보기들: ${JSON.stringify(n.options)}`);
      }
    }
  }
  console.log(`\n객관식 정답 검증: 대조 가능 ${checked}건 중 불일치 ${suspect}건`);

  // Order items: replaying correct_order must rebuild the stated answer.
  let oChecked = 0;
  let oBad = 0;
  for (const r of rows) {
    const o = r.q as Record<string, unknown>;
    const n = normalizeQuizItem(o);
    if (n?.type !== "order" || !n.answer_text) continue;
    oChecked++;
    const rebuilt = n.correct_order.map((i) => n.words[i]).join("");
    const strip = (s: string) => s.replace(/[\s.,!?;:。，、？！；：“”‘’（）()]/g, "");
    if (strip(rebuilt) !== strip(n.answer_text)) {
      oBad++;
      if (oBad <= 8) console.log(`\n[순서 불일치] 재조합="${rebuilt}"  정답문="${n.answer_text}"`);
    }
  }
  console.log(`순서 문항 검증: ${oChecked}건 중 불일치 ${oBad}건`);
}

// Sanity: dump a normalized sample of each type.
console.log("\n정규화 결과 샘플:");
for (const want of ["choice", "fill", "order"]) {
  const hit = rows.map((r) => normalizeQuizItem(r.q)).find((n) => n?.type === want);
  console.log(`\n--- ${want}\n${JSON.stringify(hit, null, 1)}`);
}

await c.end();
