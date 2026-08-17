# DingDong — 중국어 학습 웹앱

한국인 학습자를 위한 중국어 학습 서비스. 코스/레슨, 드라마·노래 기반 학습, 단어장 SRS 복습, 웹 푸시 알림을 제공합니다.

> 📖 **비개발자용 기능 소개 + 영상·학습송 생성 로직**은 [소개.md](소개.md)를 참고하세요.
> 이 README는 개발·운영(로컬 개발, DB, 배포)에 집중합니다.

- **프론트/서버**: TanStack Start (React 19, SSR) + Vite + Nitro(Node 서버)
- **DB**: Railway Postgres + Drizzle ORM (스키마: [src/db/schema.ts](src/db/schema.ts), 마이그레이션: `drizzle/`)
- **인증**: better-auth (아이디/비밀번호 + Google OAuth), 세션 쿠키 방식. 역할: 학생 / 교수자 / admin
- **미디어**: Suno 음원/영상·레슨 이미지를 Railway 볼륨(`/data`)에 저장, `/media/*` 라우트로 서빙
- **AI**: Google Gemini API (드라마 생성, 레슨 이미지, 가사 병음·번역, 영상 대본), Suno(노래 생성)
- **배포**: GitHub → Railway 자동 배포

## 주요 기능

- **코스 / 레슨**: 핵심 표현·실전 대화·슬라이드·퀴즈, 퀴즈 70%↑ 시 완료 처리·진도 저장
- **영상 학습(드라마)**: AI 생성 학습 영상. 장면별 핵심 대사(타임스탬프)·단어장·퀴즈, 이어보기
- **학습송**: 중국어 노래 학습. 가라오케 싱크·병음/번역·핵심 단어·문법 노트, 레슨 연계
- **단어장 & SRS**: 어디서든 저장한 단어를 간격 반복으로 복습, 연습 문제 자동 생성
- **학습 대시보드 / 위젯**: 스트릭·잔디밭·HSK 분포·이어보기 등 개인화 홈
- **통합 검색 · 웹 푸시 알림**
- **교수자 도구**: 영상 스튜디오(`/studio`), 학습송 생성·예약, 학생 현황(`/students`), 연동 상태(`/integrations`)

## 콘텐츠 자동 생성 파이프라인

교수자는 키워드/옵션만 고르면 서버가 콘텐츠를 자동 생성합니다. **웹 우선**(유튜브 없이 딩동 웹에 바로 게시)이 기본이며, 예약·반복으로 무인 생성도 가능합니다. 상세 로직은 [소개.md 2부](소개.md#2부-교수자에게--영상--학습송-생성-로직) 참고.

- **영상**: 대본(Gemini) → TTS(Google, 한자는 중국어 음성 분리 합성) → 자막 → Pexels 클립 → ffmpeg 렌더(인트로·BGM·썸네일) → 게시 + 드라마/레슨 학습 콘텐츠 자동 생성
- **학습송**: 작사(Gemini) → Suno 곡 생성(백그라운드 폴러가 완성) → 가라오케 싱크 → 단어·문법 노트 자동 생성
- **예약·반복**: 서버 내 1분 틱 스케줄러(KST 시각/요일, 키워드 순환, 실행당 N개). 유휴 시 놓칠 수 있어 외부 크론 권장.

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

## DB 백업 / 복원

- 서버가 매일 04:30 KST(+ 배포 직후 오늘 파일이 없으면 즉시)에 전체 테이블을
  `/data/backups/dingdong-YYYY-MM-DD.jsonl.gz`로 백업합니다 (7일 보관, 순수 Node — pg_dump 불필요).
- 마지막 백업 상태는 `app_credentials`의 `backup_status` 키에 기록됩니다.
- 복원 (대상 DB에 스키마 적용 후):

```bash
npm run db:migrate
node scripts/restore-backup.mjs <백업파일.jsonl.gz> --yes  # 전 테이블 TRUNCATE 후 복원
```

## 히스토리

- Lovable에서 export → 자체 호스팅 전환 (2026-07)
- Supabase(DB·Auth·Storage) → Railway Postgres + better-auth + 볼륨 저장으로 전면 이전.
  기존 콘텐츠(코스·레슨·드라마·노래)는 이전 완료, 계정은 재가입 방식.
  Supabase Storage에 있던 미디어(노래 음원·커버, 레슨 이미지)도 2026-07-14에
  Railway 볼륨으로 복사 완료 — Supabase 프로젝트를 삭제해도 앱은 깨지지 않습니다
  (단, curriculum_plans 데이터만 Supabase에 남아 있음).
