// One-off: attach the stored SRT to already-published YouTube videos as a CC
// track. No re-render, no re-upload — captions.insert works on existing videos.
//
// Quota: captions.list is 50 units, captions.insert 400, against a 10,000/day
// project budget. The run stops cleanly when the budget is spent and resumes
// on the next invocation — videos that already carry a track are skipped, so
// re-running is safe.
//
//   npx tsx --env-file=.env backfill-captions.ts [--probe] [maxUploads]
//
//   --probe   check one video's caption list and exit (verifies the token has
//             the force-ssl scope without spending an insert)
//
// Delete this file once every video has captions.

import { Client } from "pg";

import { listCaptionTracks, uploadCaptionTrack } from "./src/lib/video/youtube.server";
import type { VideoJobConfig } from "./src/lib/video/config";

const LIST_UNITS = 50;
const INSERT_UNITS = 400;
const BUDGET = 8000; // leave headroom for normal uploads today

const probe = process.argv.includes("--probe");
const maxUploads = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 999);

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows } = await c.query(
  `select id, config, srt, youtube_video_id, script->>'title' as title
     from video_jobs
    where youtube_video_id is not null and srt is not null
    order by created_at desc`,
);

if (probe) {
  const v = rows[0];
  console.log(`probing: ${v.title?.slice(0, 40)} (${v.youtube_video_id})`);
  try {
    const tracks = await listCaptionTracks(v.youtube_video_id);
    console.log(`OK — force-ssl scope is present.`);
    console.log(
      `existing tracks: ${
        tracks.length ? tracks.map((t) => `${t.language}/${t.trackKind}`).join(", ") : "none"
      }`,
    );
    console.log(`\ncandidates with a YouTube id + SRT: ${rows.length}`);
  } catch (e) {
    console.log(`FAILED — ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
  await c.end();
  process.exit();
}

console.log(`candidates: ${rows.length}   quota budget: ${BUDGET} units\n`);

let spent = 0;
let uploaded = 0;
let already = 0;
let stopped = false;
const failed: { title: string; reason: string }[] = [];

for (const [i, job] of rows.entries()) {
  if (uploaded >= maxUploads) {
    stopped = true;
    break;
  }
  if (spent + LIST_UNITS + INSERT_UNITS > BUDGET) {
    stopped = true;
    break;
  }

  const cfg = job.config as VideoJobConfig;
  const lang = cfg.language === "zh" ? "zh-CN" : "ko";
  const tag = `[${i + 1}/${rows.length}] ${(job.title ?? job.youtube_video_id).slice(0, 38)}`;

  try {
    const tracks = await listCaptionTracks(job.youtube_video_id);
    spent += LIST_UNITS;
    // Only a real uploaded track counts as done — an ASR track is YouTube's
    // machine transcript, which our exact script text should replace.
    // The API returns "asr" lower-case, so compare case-insensitively.
    if (tracks.some((t) => t.language === lang && t.trackKind.toLowerCase() !== "asr")) {
      already++;
      console.log(`${tag} — 이미 있음 (${lang})`);
      continue;
    }

    await uploadCaptionTrack({
      videoId: job.youtube_video_id,
      srt: job.srt,
      language: lang,
      name: cfg.language === "zh" ? "中文" : "한국어",
    });
    spent += INSERT_UNITS;
    uploaded++;
    console.log(`${tag} — CC 추가 ✓ (${lang})`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (/quota/i.test(reason)) {
      console.log(`${tag} — 할당량 소진, 중단`);
      stopped = true;
      break;
    }
    failed.push({ title: job.title ?? job.youtube_video_id, reason });
    console.log(`${tag} — 실패: ${reason.slice(0, 90)}`);
  }
}

await c.end();

console.log(`\n═══ done ═══`);
console.log(`CC 추가: ${uploaded}   이미 있음: ${already}   실패: ${failed.length}`);
console.log(`사용 할당량: ~${spent} units`);
const remaining = rows.length - uploaded - already - failed.length;
if (stopped && remaining > 0) {
  console.log(`\n남은 ${remaining}개는 내일 다시 실행하세요 (할당량은 태평양시 자정에 초기화):`);
  console.log(`  npx tsx --env-file=.env backfill-captions.ts`);
}
if (failed.length) {
  console.log(`\nfailures:`);
  failed.forEach((f) => console.log(`  - ${f.title.slice(0, 40)}: ${f.reason.slice(0, 130)}`));
}
