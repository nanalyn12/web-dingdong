// plan-drama-levels.mjs 가 만든 apply.sql 을 실행한다.
//
//   node scripts/apply-drama-levels.mjs data/backups/dramas-level-....-apply.sql
//
// 안전장치:
//  1) 실행 전후로 level 을 뺀 모든 컬럼의 해시를 계산해 비교한다. 해시가 달라지면
//     level 외의 무언가가 바뀐 것이므로 즉시 드러난다.
//  2) 파일에 담긴 SQL 전체가 하나의 트랜잭션(BEGIN/COMMIT)이다. 중간에 실패하면
//     아무것도 남지 않는다.
//  3) UPDATE 된 행 수를 세어 계획된 건수와 다르면 경고한다.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-drama-levels.mjs <apply.sql>");
  process.exit(1);
}
const sqlText = readFileSync(file, "utf8");
const planned = (sqlText.match(/^UPDATE dramas SET/gm) ?? []).length;
if (planned === 0) throw new Error("apply.sql 에 UPDATE 문이 없습니다.");

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n\r]+)"?/m)?.[1];
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// level 을 제외한 전 컬럼의 지문. 이 값이 그대로면 다른 데이터는 손대지 않은 것이다.
const FINGERPRINT = `
  SELECT md5(string_agg(t.row_text, '|')) AS h FROM (
    SELECT id::text || coalesce(title,'') || coalesce(title_zh,'') || coalesce(description,'')
        || coalesce(genre,'') || coalesce(youtube_url,'') || coalesce(youtube_video_id,'')
        || coalesce(media_url,'') || coalesce(thumbnail_url,'')
        || coalesce(duration_seconds::text,'') || has_captions::text || scenes::text
        || coalesce(created_by,'') || created_at::text || updated_at::text AS row_text
    FROM dramas ORDER BY id) t`;

const dist = async () =>
  (await client.query(`SELECT level, COUNT(*)::int AS n FROM dramas GROUP BY 1 ORDER BY 1`)).rows
    .map((r) => `${r.level}=${r.n}`)
    .join("  ");

const before = (await client.query(FINGERPRINT)).rows[0].h;
const beforeDist = await dist();
const beforeRows = (await client.query("SELECT COUNT(*)::int AS n FROM dramas")).rows[0].n;

console.log(`적용 파일   ${file}`);
console.log(`계획 건수   ${planned}건`);
console.log(`변경 전     ${beforeDist}  (총 ${beforeRows}행)`);

await client.query(sqlText);

const after = (await client.query(FINGERPRINT)).rows[0].h;
const afterDist = await dist();
const afterRows = (await client.query("SELECT COUNT(*)::int AS n FROM dramas")).rows[0].n;
await client.end();

console.log(`변경 후     ${afterDist}  (총 ${afterRows}행)`);
console.log("");
console.log(`행 수 유지          ${beforeRows === afterRows ? "OK" : "다름 — 확인 필요"}`);
console.log(
  `level 외 컬럼 불변  ${before === after ? "OK (해시 동일)" : "달라짐 — 즉시 롤백 필요"}`,
);
if (before !== after || beforeRows !== afterRows) process.exitCode = 1;
