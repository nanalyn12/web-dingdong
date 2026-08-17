// dramas.level 재분류 계획 생성기 — 읽기 전용.
//
//   node scripts/plan-drama-levels.mjs
//
// DB에 아무것도 쓰지 않는다. data/backups/ 아래에 네 개의 산출물을 남긴다:
//   *-snapshot.json  350행 전체의 (id, title, level) 스냅샷
//   *-changes.csv    변경 대상 목록 (검토용)
//   *-apply.sql      적용 SQL (검토 후 별도로 실행)
//   *-rollback.sql   되돌리기 SQL (변경 대상만, 다른 컬럼은 건드리지 않음)
//
// 기준: 영상의 scenes[].vocab[].hsk 평균이
//   >= 5.0 → advanced, >= 3.65 → intermediate, 그 외 → beginner
//
// 중급 임계값이 3.65인 이유: 사람이 붙인 라벨에서 역산한 경계는 3.5였지만,
// 3.5~3.65 구간의 11건은 사람이 보면 초급이라 볼 여지가 커서 검토 끝에
// 제외하기로 했다. 임계값을 올리는 쪽이 예외 목록을 따로 두는 것보다 규칙이
// 하나로 유지된다.
//
// 어휘 데이터가 없는 영상은 판정 불가로 보고 제외한다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const ADVANCED_AT = 5.0;
const INTERMEDIATE_AT = 3.65;

const root = new URL("..", import.meta.url);
const env = readFileSync(new URL(".env", root), "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n\r]+)"?/m)?.[1];
if (!url) throw new Error("DATABASE_URL을 .env에서 찾지 못했습니다.");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(`
  WITH words AS (
    SELECT d.id,
           NULLIF(regexp_replace(w->>'hsk', '[^0-9]', '', 'g'), '')::int AS hsk
    FROM dramas d
    CROSS JOIN LATERAL jsonb_array_elements(d.scenes) AS s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(s->'vocab') = 'array' THEN s->'vocab' ELSE '[]'::jsonb END) AS w
  ),
  stats AS (
    SELECT id, COUNT(hsk)::int AS words, ROUND(AVG(hsk)::numeric, 2) AS avg_hsk
    FROM words GROUP BY id
  )
  SELECT d.id, d.title, d.level, COALESCE(s.words, 0) AS words, s.avg_hsk
  FROM dramas d LEFT JOIN stats s ON s.id = d.id
  ORDER BY d.created_at`);
await client.end();

const proposedFor = (avg) => {
  if (avg == null) return null; // 판정 불가
  const v = Number(avg);
  if (v >= ADVANCED_AT) return "advanced";
  if (v >= INTERMEDIATE_AT) return "intermediate";
  return "beginner";
};

const changes = [];
for (const r of rows) {
  const proposed = proposedFor(r.avg_hsk);
  // 초급으로 등록된 것만 대상으로 삼는다. 사람이 중급·고급으로 분류해 둔
  // 92건은 이번 작업의 범위가 아니므로 규칙이 뭐라 하든 손대지 않는다.
  if (r.level !== "beginner") continue;
  if (!proposed || proposed === r.level) continue;
  changes.push({ ...r, proposed });
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const dir = new URL("data/backups/", root);
mkdirSync(dir, { recursive: true });
const out = (suffix) => new URL(`dramas-level-${stamp}-${suffix}`, dir);

writeFileSync(
  out("snapshot.json"),
  JSON.stringify(
    {
      takenAt: new Date().toISOString(),
      table: "dramas",
      rows: rows.map(({ id, title, level }) => ({ id, title, level })),
    },
    null,
    2,
  ),
  "utf8",
);

const csvCell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
writeFileSync(
  out("changes.csv"),
  ["id,title,current_level,proposed_level,avg_hsk,vocab_words"]
    .concat(
      changes.map((c) =>
        [c.id, csvCell(c.title), c.level, c.proposed, c.avg_hsk, c.words].join(","),
      ),
    )
    .join("\n"),
  "utf8",
);

const sqlLines = (list, levelOf) =>
  list.map((c) => `UPDATE dramas SET level = '${levelOf(c)}' WHERE id = '${c.id}';`).join("\n");

writeFileSync(
  out("apply.sql"),
  `-- dramas.level 재분류 (규칙 A: 평균 HSK >= ${ADVANCED_AT} 고급 / >= ${INTERMEDIATE_AT} 중급)\n` +
    `-- 대상 ${changes.length}건. level 외의 컬럼은 건드리지 않는다.\n` +
    `BEGIN;\n${sqlLines(changes, (c) => c.proposed)}\nCOMMIT;\n`,
  "utf8",
);

writeFileSync(
  out("rollback.sql"),
  `-- 위 변경을 되돌린다. 변경한 ${changes.length}건의 level만 원래 값으로 복원한다.\n` +
    `BEGIN;\n${sqlLines(changes, (c) => c.level)}\nCOMMIT;\n`,
  "utf8",
);

const by = (level) => changes.filter((c) => c.proposed === level).length;
const undecidable = rows.filter((r) => r.level === "beginner" && r.avg_hsk == null).length;
console.log(`스냅샷      ${rows.length}행`);
console.log(
  `변경 대상   ${changes.length}건 (중급 ${by("intermediate")} · 고급 ${by("advanced")})`,
);
console.log(`판정 불가   ${undecidable}건 — 초급 유지, 손대지 않음`);
console.log(`초급 유지   ${rows.filter((r) => r.level === "beginner").length - changes.length}건`);
console.log(`\n산출물: data/backups/dramas-level-${stamp}-*.{json,csv,sql}`);
