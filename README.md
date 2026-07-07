# DingDong — 중국어 학습 웹앱

한국인 학습자를 위한 중국어 학습 서비스. 코스/레슨, 드라마·노래 기반 학습, 단어장 복습, 웹 푸시 알림을 제공합니다.

- **프론트/서버**: TanStack Start (React 19, SSR) + Vite + Nitro(Node 서버)
- **DB/인증**: Supabase (`supabase/migrations`에 스키마 이력)
- **AI**: Lovable AI Gateway (드라마 생성, 레슨 이미지, 가사 병음·번역), Suno(노래 생성)
- **배포**: GitHub → Railway 자동 배포

## 로컬 개발

```bash
npm install          # .npmrc의 legacy-peer-deps 사용
cp .env.example .env # 값 채우기 (기존 .env 있으면 생략)
npm run dev          # http://localhost:8080
```

## 프로덕션 빌드 / 실행

```bash
npm run build   # .output/ 에 Node 서버 생성
npm run start   # node .output/server/index.mjs (PORT 환경변수 사용)
```

## Railway 배포

1. 이 저장소를 GitHub에 push
2. [Railway](https://railway.com) → **New Project → Deploy from GitHub repo** 선택
3. 빌드/시작 명령은 `railway.json`이 자동 적용 (`npm run build` / `npm run start`)
4. **Variables 탭에 환경변수 등록** — `.env.example` 참고:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - AI 기능 사용 시: `LOVABLE_API_KEY` (Lovable 워크스페이스 설정에서 발급)
   - 노래 생성: `SUNO_API_KEY`, 자막 수집: `SUPADATA_API_KEY`
   - 푸시 알림: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
5. **Settings → Networking → Generate Domain**으로 공개 URL 생성

### Supabase 쪽 설정

- **Auth → URL Configuration**: Site URL과 Redirect URLs에 Railway 도메인 추가
- **Google 로그인**을 쓰려면 Authentication → Providers → Google 활성화
  (클라이언트 ID/시크릿 필요). 활성화 전까지는 아이디/비밀번호 로그인만 동작합니다.

## Lovable에서 분리하며 바뀐 것

- Google OAuth: Lovable 인증 브로커 → Supabase 네이티브 `signInWithOAuth`
- 빌드 타깃: Cloudflare 기본값 → `node-server` 고정 ([vite.config.ts](vite.config.ts))
- 패키지 매니저: bun → npm (`package-lock.json` 기준)
- `.env`는 git에서 제외 (`.env.example`로 키 목록 관리)
