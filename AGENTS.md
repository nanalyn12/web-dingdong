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
- UI는 **모바일 우선**입니다. 접두사 없는 Tailwind 토큰이 폰 값, `md:`가 데스크톱 값으로
  되돌립니다(예: `h-11 md:h-9`). 크기 규격은 `src/lib/mobile-ui.ts` 한 곳에 있고
  `mobile-ui.test.ts`가 px 단위로 검사합니다 — 프리미티브에 크기를 직접 적지 마세요.
- `src/lib/mobile-density.test.ts`는 **소스를 스캔하는 가드**입니다. 카드에 접두사 없는
  `p-6`/`p-8`, 컨트롤(`Button`/`SelectTrigger`/`Input`/`SpeakButton`)에 44px 미만
  `h-*`·`size-*`, `max-h-[Nvh]`(→ `dvh`)를 쓰면 게이트가 파일·줄과 함께 실패합니다.
- 내비게이션 항목은 `src/lib/nav-items.ts`에서만 정의합니다. 사이드바·모바일 시트·하단
  탭바 셋이 이 목록을 공유하므로 어느 한 곳에 링크를 직접 추가하지 마세요.
- `--tab-bar-height`(CSS, md 이상 0px)를 레이아웃 여백·FAB 위치·드래그 클램프가 함께
  읽습니다. 하단 고정 요소를 다룰 때 이 변수를 쓰세요.
