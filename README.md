# DingDong — 중국어 학습 웹앱

한국인 학습자를 위한 중국어 학습 서비스. 코스/레슨, 드라마·노래 기반 학습, 단어장 SRS 복습, 웹 푸시 알림을 제공합니다.

- **프론트/서버**: TanStack Start (React 19, SSR) + Vite + Nitro(Node 서버)
- **DB**: Railway Postgres + Drizzle ORM (스키마: [src/db/schema.ts](src/db/schema.ts), 마이그레이션: `drizzle/`)
- **인증**: better-auth (아이디/비밀번호 + Google OAuth), 세션 쿠키 방식
- **미디어**: Suno 음원/영상·레슨 이미지를 Railway 볼륨(`/data`)에 저장, `/media/*` 라우트로 서빙
- **AI**: Google Gemini API (드라마 생성, 레슨 이미지, 가사 병음·번역, 영상 대본), Suno(노래 생성)
- **배포**: GitHub → Railway 자동 배포

## 로컬 개발

```bash
npm install          # .npmrc의 legacy-peer-deps 사용
cp .env.example .env # 값 채우기
npm run dev          # http://localhost:8080
```

## DB 스키마 변경

```bash
# src/db/schema.ts 수정 후:
npm run db:generate  # drizzle/에 SQL 마이그레이션 생성
npm run db:migrate   # DATABASE_URL 대상으로 적용 (로컬 .env는 Railway public URL)
```

마이그레이션은 배포 전에 로컬에서 직접 적용합니다 (`db:migrate`가 Railway Postgres public URL로 실행됨).

## 프로덕션 빌드 / 실행

```bash
npm run build   # .output/ 에 Node 서버 생성
npm run start   # node .output/server/index.mjs (PORT 환경변수 사용)
```

## Railway 구성

- 서비스 `dingdong` (GitHub repo 연동, main push → 자동 배포) + `Postgres`
- `dingdong` 볼륨: `/data` 마운트 (미디어 저장용, `MEDIA_DIR=/data/media`)
- 환경변수: `.env.example` 참고. `DATABASE_URL`은 `${{Postgres.DATABASE_URL}}` 참조로 연결됨
- 관리자 계정: `ADMIN_EMAILS`에 `<아이디>@dingdong.local` 추가 후 해당 아이디로 가입/로그인

### Google 로그인 활성화 (선택)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 클라이언트 ID 생성 (웹 애플리케이션)
2. 승인된 리디렉션 URI: `https://<도메인>/api/auth/callback/google`
3. Railway Variables에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 추가

설정 전까지 Google 버튼은 오류 토스트만 띄우고, 아이디/비밀번호 로그인은 정상 동작합니다.

## 히스토리

- Lovable에서 export → 자체 호스팅 전환 (2026-07)
- Supabase(DB·Auth·Storage) → Railway Postgres + better-auth + 볼륨 저장으로 전면 이전.
  기존 콘텐츠(코스·레슨·드라마·노래)는 이전 완료, 계정은 재가입 방식.
  기존에 생성된 노래의 미디어 URL은 Supabase Storage를 가리키므로 Supabase 프로젝트를
  삭제하면 해당 음원 링크가 깨집니다 (새로 생성되는 미디어는 Railway 볼륨에 저장됨).
