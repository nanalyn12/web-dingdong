// One-off: fill 실전대화/슬라이드/퀴즈 on video lessons created before the
// pipeline generated them. Only touches lessons where all three are empty, so
// re-running is safe and manually edited lessons are never overwritten.
//
// The source of truth is the linked video_job's script — the same input the
// pipeline now uses — so a backfilled lesson is identical to a freshly
// generated one.
//
//   npx tsx --env-file=.env backfill-lesson-practice.ts [--dry] [limit]
//
//   --dry   list what would be filled and exit (no AI calls, no writes)
//
// One Gemini call per lesson. Progress is committed per lesson, so an
// interrupted run resumes where it stopped.
//
// Delete this file once every video lesson has practice material.

import { Client } from "pg";

import { buildLessonEnrichment } from "./src/lib/video/lesson-enrich.server";
import type { VideoJobConfig, VideoScript } from "./src/lib/video/config";

const dry = process.argv.includes("--dry");
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 999);

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Empty on all three, and reachable from a job that still has its script.
const { rows } = await c.query(`
  select l.id, l.title, j.config, j.script
    from lessons l
    join video_jobs j on j.drama_id = (l.video->>'drama_id')::uuid
   where jsonb_array_length(coalesce(l.dialogues,'[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(l.slides,'[]'::jsonb))    = 0
     and jsonb_array_length(coalesce(l.quiz,'[]'::jsonb))      = 0
     and j.script is not null
   order by l.created_at`);

console.log(`대상 강의: ${rows.length}개${dry ? " (dry run)" : ""}\n`);

if (dry) {
  rows.slice(0, limit).forEach((r, i) =>
    console.log(`  ${i + 1}. ${String(r.title).slice(0, 50)}`),
  );
  const orphan = await c.query(`
    select count(*)::int n from lessons l
     where jsonb_array_length(coalesce(l.slides,'[]'::jsonb)) = 0
       and not exists (
         select 1 from video_jobs j
          where j.drama_id = (l.video->>'drama_id')::uuid and j.script is not null)`);
  console.log(`\n대본이 없어 건너뛸 강의: ${orphan.rows[0].n}개`);
  await c.end();
  process.exit();
}

let filled = 0;
const failed: { title: string; reason: string }[] = [];

for (const [i, row] of rows.slice(0, limit).entries()) {
  const tag = `[${i + 1}/${Math.min(rows.length, limit)}] ${String(row.title).slice(0, 38)}`;
  try {
    const e = await buildLessonEnrichment(
      row.config as VideoJobConfig,
      row.script as VideoScript,
    );
    if (e.slides.length === 0 && e.dialogues.length === 0) {
      throw new Error("AI가 빈 결과를 반환");
    }
    await c.query(
      `update lessons set dialogues = $1, slides = $2, quiz = $3, updated_at = now()
        where id = $4`,
      [
        JSON.stringify(e.dialogues),
        JSON.stringify(e.slides),
        JSON.stringify(e.quiz),
        row.id,
      ],
    );
    filled++;
    console.log(
      `${tag} — 대화 ${e.dialogues.length} / 슬라이드 ${e.slides.length} / 퀴즈 ${e.quiz.length} ✓`,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    failed.push({ title: row.title, reason });
    console.log(`${tag} — 실패: ${reason.slice(0, 90)}`);
    // A rate limit will hit every remaining lesson too; stop instead of
    // burning the rest of the run against it.
    if (/429|rate.?limit|quota/i.test(reason)) {
      console.log("\n요청 한도 초과 — 중단합니다. 잠시 후 다시 실행하세요.");
      break;
    }
  }
}

await c.end();

console.log(`\n═══ done ═══`);
console.log(`채움: ${filled}   실패: ${failed.length}   남음: ${rows.length - filled}`);
if (failed.length) {
  console.log(`\nfailures:`);
  failed.forEach((f) => console.log(`  - ${f.title.slice(0, 40)}: ${f.reason.slice(0, 120)}`));
}
if (rows.length - filled > 0) {
  console.log(`\n남은 강의는 다시 실행하면 이어서 처리됩니다:`);
  console.log(`  npx tsx --env-file=.env backfill-lesson-practice.ts`);
}
