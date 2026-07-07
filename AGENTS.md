# Agent notes

- 이 저장소는 Lovable에서 export한 코드 기반의 독립 프로젝트입니다 (Lovable git 동기화 없음).
- 배포: GitHub push → Railway 자동 배포. 빌드/시작 명령은 `railway.json` 참고.
- 패키지 설치는 npm. `.npmrc`의 `legacy-peer-deps=true`가 필요합니다
  (zod v4 ↔ @tanstack/zod-adapter peer 충돌 때문).
- 프로덕션 빌드는 Nitro `node-server` 프리셋 → `.output/server/index.mjs` (PORT 환경변수 사용).
- DB 스키마 변경은 `supabase/migrations`에 SQL 마이그레이션으로 추가.
- 서버 환경변수 목록은 `.env.example` 참고. `.env`는 커밋 금지.
