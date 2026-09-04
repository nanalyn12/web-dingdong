# CLAUDE.md

프로젝트 배경·배포·스택 메모는 [AGENTS.md](AGENTS.md) 참고.

## 하네스: dingdong 코드 변경

**목표:** 이 저장소의 모든 코드 변경을 "합격 기준 먼저 → 실패 확인 → 최소 구현 → L1·L2 게이트 통과" 순서로 진행해, 기준이 구현 도중에 조용히 느슨해지지 않게 한다.

**트리거:** dingdong 소스를 수정하는 모든 작업(새 기능, 버그 수정, 리팩터, 스키마 변경, AI 연동 변경)에서 `dingdong-harness` 스킬을 사용하라. 단순 질문·조회는 직접 응답 가능.

**작업을 마쳤다고 말할 수 있는 조건 (L1·L2 게이트):**

```bash
npm run verify
```

= `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`. 넷이 모두 통과해야 완료다. 하나라도 실패하면 완료가 아니라 진행 중이다.

> lint는 저장소 전체가 깨끗한 상태를 기준선으로 삼는다(errors 0). 남아 있는 경고 11건은 react-hooks·fast-refresh 계열로 실패로 치지 않지만, 새로 늘리지는 않는다.

**변경 이력:**

| 날짜       | 변경 내용                                       | 대상                                                          | 사유                                                        |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 2026-08-09 | 초기 구성 (에이전트 4 + 스킬 4)                 | 전체                                                          | 하네스 엔지니어링 도입                                      |
| 2026-08-09 | 환경변수 부팅 검증 도입                         | src/lib/env.server.ts                                         | 키 누락이 런타임에야 드러나던 문제                          |
| 2026-08-09 | Vitest 도입 + 순수 로직 유닛 테스트             | vitest.config.ts, src/\*_/_.test.ts                           | L1 게이트 부재                                              |
| 2026-08-09 | 저장소 전체 서식 정리 후 lint 게이트 복원       | 전체 (서식), src/lib/speech-recognition.ts                    | 게이트를 변경 파일 기준으로 낮춰 뒀던 부채 해소             |
| 2026-08-09 | 편향된 sort 셔플을 Fisher-Yates로 교체          | src/lib/shuffle.ts, 복습·학습송 화면 4곳                      | 매칭·순서 맞추기 문제가 뜻이 아니라 위치로 풀리던 문제      |
| 2026-08-15 | 드라마 난이도 개별 수정 기능 + 권한 판정 단일화 | src/lib/roles.ts, dramas.functions.ts, \_app.dramas.index.tsx | 등록 후 난이도를 고칠 경로가 DB밖에 없었음                  |
| 2026-08-18 | 제작자별 콘텐츠 백업·복원 (관리자·교수자)       | src/lib/tenant-backup\*.ts, drizzle/0018, \_app.admin.tsx     | 야간 전체 백업은 제작자가 자기 콘텐츠만 되돌릴 수단이 못 됨 |
| 2026-08-18 | Gemini 개인 키를 AI 호출 16곳 전부에 연결      | src/lib/ai-gateway.server.ts + 호출부 13개 모듈               | 개인 키가 叮叮 챗봇에서만 쓰이고 나머지는 공용 키로 새고 있었음 |
| 2026-08-18 | Suno 개인 키 지원 + 키 선택 규칙 공용화        | src/lib/api-key-choice.ts, suno.server.ts, \_app.settings.tsx | Suno는 건당 실과금이라 공용 키로만 도는 것이 곧 관리자 카드 결제 |
| 2026-08-18 | Supabase 잔재 삭제 + 볼륨 청소 분리·테스트     | src/lib/media-cleanup{,.server}.ts, server.ts, schema.ts      | 잔여 URL 0건 확인 후 죽은 코드 제거. 삭제 판정을 순수 함수로 빼 검증 가능하게 |
| 2026-08-22 | 모바일 탭 타깃·다이얼로그·safe-area (배치 1)    | src/lib/mobile-ui.ts, ui/{button,tabs,dialog,input,select}.tsx | 375px 실측에서 탭 타깃 26/50이 40px 미만. 규격을 순수 모듈로 빼 px 단위로 판정 가능하게 |
| 2026-08-22 | 모바일 내비게이션 시트 + 링크 목록 단일화 (배치 2) | src/lib/nav-items.ts, nav-links.tsx, mobile-nav.tsx, app-sidebar.tsx | 폰에서 도달 가능한 내비 링크가 0개였음. 권한 분기가 Link 7블록에 흩어져 두 표면이 갈라질 위험 |
| 2026-08-22 | 모바일 밀도 일괄 조정 (배치 3)                  | src/lib/mobile-density.test.ts + 라우트·컴포넌트 24개 (패딩 66곳·탭 타깃 36곳) | 본문 폭 294px, 호출부 고정 높이가 프리미티브를 덮고 있었음. 규칙을 소스 가드로 고정 |
| 2026-08-22 | 화면별 모바일 마무리 (배치 4)                   | coachmark-visibility.ts, fab-placement.ts, student-activity.ts, lessons/songs/students | 코치마크가 폰에서 자동 실행, FAB이 홈 인디케이터 침범, 학습송 상세 컨트롤 21개가 44px 미만 |
| 2026-08-22 | 모바일 하단 탭바 (배치 5)                       | src/components/mobile-tab-bar.tsx, nav-items.ts, fab-placement.ts, styles.css | 학습송·영상 학습이 햄버거 뒤 두 번 탭에 숨어 있었음. 학습 앱의 주 목적지가 상시 노출되지 않았음 |
| 2026-08-22 | 듣기 버튼 8개 복사본 → SpeakButton 통합 (배치 6) | src/components/speak-button.tsx + 호출부 8곳, vocabulary·dialog 컨트롤 | 레슨 화면 컨트롤 39개가 44px 미만. 같은 알약이 8곳에 복붙돼 두 개는 aria-label조차 없었음 |
| 2026-09-03 | 위젯 순서 변경 터치 지원 (배치 7)               | src/lib/widget-order.ts, widget-panel.tsx | 재정렬이 HTML5 draggable 뿐이라 터치에서 이벤트가 안 떠 폰에서 순서를 못 바꿨음 |
| 2026-09-03 | 다크모드 (배치 8)                               | src/lib/theme.ts, theme-provider/-toggle.tsx, __root.tsx, drizzle/0019, styles.css | `.dark` 토큰과 `@custom-variant`는 있었으나 클래스를 붙이는 코드가 0건. 그라디언트·그림자·팔레트 8개 토큰도 라이트 전용이었음 |
| 2026-09-03 | 하드코딩 흰색 265건 → `--surface` (배치 9)      | src/lib/surface-tokens.test.ts + tsx 34파일, styles.css 유틸 4곳 | 클래스에 박힌 `bg-white/50`은 토큰이 아니라 `.dark`가 다시 칠할 수 없었음. 가드로 재유입 차단 |
| 2026-09-03 | 오늘의 단어·수업 이어하기 위젯 (배치 10)        | src/lib/widget-catalog.ts, widgets.functions.ts, widget-panel.tsx | 위젯이 전부 '보기' 전용이었고 이어보기가 영상만 다뤘음. 위젯 id·메타 이중 정의도 함께 해소 |
| 2026-09-04 | 하드코딩 팔레트 → 시맨틱 토큰 (배치 11)         | src/lib/color-contrast.ts, palette-tokens.test.ts, levels.ts, styles.css + tsx 29파일 | `text-slate-700`이 다크에서 1.15:1. 색이 중립·상태·난이도 세 일을 겸하고 있어 단순 치환이 불가능했음. 대비 판정을 순수 산술로 빼 게이트에 넣음 |
| 2026-09-04 | PDF 저장 복구 — 렌더러 교체 (배치 12)          | src/lib/pdf-report.ts, file-delivery.ts, PDF 버튼 2개, html2pdf.js 제거 | html2canvas 1.4.1이 oklch를 파싱 못 해 PDF가 **한 번도** 만들어진 적 없었음. iOS는 앵커 download도 무시. 렌더·전달 양쪽을 고침 |
