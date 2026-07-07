# Agent notes

- 이 저장소는 Lovable에서 export한 코드 기반의 독립 프로젝트입니다 (Lovable git 동기화 없음).
- 배포: GitHub push → Railway 자동 배포. 빌드/시작 명령은 `railway.json` 참고.
- 패키지 설치는 npm. `.npmrc`의 `legacy-peer-deps=true`가 필요합니다
  (zod v4 ↔ @tanstack/zod-adapter peer 충돌 때문).
- 프로덕션 빌드는 Nitro `node-server` 프리셋 → `.output/server/index.mjs` (PORT 환경변수 사용).
- DB: Railway Postgres + Drizzle. 스키마는 `src/db/schema.ts`, 변경 시
  `npm run db:generate` → `npm run db:migrate` (로컬 .env의 DATABASE_URL이 Railway public URL).
- 인증: better-auth (`src/lib/auth.server.ts`), 서버 함수는 `requireAuth` 미들웨어 사용.
  DB 접근은 서버 함수 핸들러 안에서 `const { db, tables } = await import("@/db")` 지연 import.
- 미디어 파일은 `MEDIA_DIR`(Railway 볼륨 /data/media)에 저장, `/media/*` 라우트로 서빙.
- 서버 환경변수 목록은 `.env.example` 참고. `.env`는 커밋 금지.
