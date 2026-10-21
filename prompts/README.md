# 논문 부록 A — 프롬프트 자료 · 웹앱 Dingdong

이 폴더는 박사학위논문의 부록 A(프롬프트 자료) 가운데 **웹앱 Dingdong**에 해당하는 프롬프트를 한 항목씩 나누어 옮긴 것입니다.
워드프레스 플러그인 Dingdong에 해당하는 프롬프트는 [wp-dingdong/prompts](https://github.com/nanalyn12/wp-dingdong/tree/main/prompts)에 있습니다.

> 이유나, 「AI 기반 하이브리드 한중 미디어 교육콘텐츠 개발 연구」, 한국외국어대학교 대학원 박사학위논문, 2027

| 바로가기 | 수록 범위 | 건수 |
|---|---|---|
| [개발 프롬프트 (표준화)](#개발-프롬프트-표준화) | 부록 A-1-18 ~ A-1-37 | 20건 |
| [시스템 내장 프롬프트](#시스템-내장-프롬프트) | 부록 A-3-01 ~ A-3-17 | 17건 |
| [워드프레스 플러그인 Dingdong 프롬프트 ↗](https://github.com/nanalyn12/wp-dingdong/tree/main/prompts) | 부록 A-1-01 ~ A-1-17, A-2 | |

## 읽는 법

- **개발 프롬프트**는 개발 중에 Claude Code에 전달한 요청을 다른 사람이 다시 쓸 수 있게 표준화한 것입니다. 대괄호 `[ ]`는 각자의 환경에 맞게 바꾸는 자리입니다.
- **시스템 내장 프롬프트**는 완성된 학습 환경이 콘텐츠를 생성할 때 생성형 AI에 전달하는 지시문의 원문입니다. 각 항목의 **출처** 링크를 누르면 기준 커밋의 해당 행으로 이동합니다.
- 각 문서 위아래의 `← 이전 · 다음 →` 링크로 차례대로 넘겨 볼 수 있고, `↑ 프롬프트 목록`으로 이 페이지에 돌아옵니다.
- 논문의 부록이 정본입니다. 이 폴더는 확인과 재현을 돕는 보조 자료입니다.

### 기준 커밋

| 저장소 | 커밋 | 날짜 |
|---|---|---|
| 워드프레스 플러그인 Dingdong | [`202c20b`](https://github.com/nanalyn12/wp-dingdong/tree/202c20bf154d80eebb78bd8495ef8f2ba573bb89) | 2026년 9월 20일 |
| 웹앱 Dingdong | [`db7a888`](https://github.com/nanalyn12/web-dingdong/tree/db7a88802cdc57a0d3266a3028d7d9eba85854ab) | 2026년 10월 21일 |

부록에 적은 파일 이름과 행 번호는 모두 이 두 커밋을 기준으로 합니다. `main` 브랜치의 코드는 이후에도 바뀔 수 있습니다.

## 개발 프롬프트 (표준화)

| 번호 | 제목 | 논문 본문 프롬프트 ID |
|---|---|---|
| [A-1-18](development/A-1-18.md) | 웹앱 Dingdong의 초기 뼈대 생성 |  |
| [A-1-19](development/A-1-19.md) | 자체 호스팅 환경으로의 이관 | PROMPT-WEBAPP-001-v1.0 |
| [A-1-20](development/A-1-20.md) | 학습 영상 생성 기능의 설계 |  |
| [A-1-21](development/A-1-21.md) | 한 문장 안에 섞인 두 언어의 음성 합성 | PROMPT-WEBAPP-003-v1.0 |
| [A-1-22](development/A-1-22.md) | 외부 서비스의 거부에 대비한 생성 자산 보존 | PROMPT-WEBAPP-004-v1.0 |
| [A-1-23](development/A-1-23.md) | 여러 학습 경로의 단어장 통합 | PROMPT-WEBAPP-005-v1.0 |
| [A-1-24](development/A-1-24.md) | 이미 만들어진 자료를 소급하여 채우기 |  |
| [A-1-25](development/A-1-25.md) | 강의·세부 강의 구조와 영상 강의의 편입 |  |
| [A-1-26](development/A-1-26.md) | 학습 대시보드 |  |
| [A-1-27](development/A-1-27.md) | 통합 검색 |  |
| [A-1-28](development/A-1-28.md) | 예약·반복 생성 스케줄러 |  |
| [A-1-29](development/A-1-29.md) | 학습송 생성 — 작사에서 학습 콘텐츠까지 |  |
| [A-1-30](development/A-1-30.md) | 노래 싱크 — 낱말 시각 정보의 글자 단위 배분 |  |
| [A-1-31](development/A-1-31.md) | 커리큘럼 생성 기능 |  |
| [A-1-32](development/A-1-32.md) | 문화 카드 — 부분만 다시 만드는 생성 기능 |  |
| [A-1-33](development/A-1-33.md) | 야간 백업 |  |
| [A-1-34](development/A-1-34.md) | 연동 상태 확인 화면 |  |
| [A-1-35](development/A-1-35.md) | 예약 실행과 대체 경로의 자동 검증 | PROMPT-WEBAPP-002-v1.0 |
| [A-1-36](development/A-1-36.md) | 실패가 반복될 때의 중단과 원인 보고 |  |
| [A-1-37](development/A-1-37.md) | 여러 항목의 점검 요청과 선계획 |  |

<details>
<summary>수록 원칙 (논문 부록 A-1)</summary>

> 수록의 원칙은 다음과 같다. 첫째, 원문을 그대로 옮기지 않고 표준화하였다. 표준화는 기록의 보존이 아니라 재현을 위한 재구성이다. 다른 사람이 그대로 입력하여 비슷한 결과에 이를 수 있도록 핵심 요소를 뽑아 다시 썼으며, 재사용할 가치가 없는 발화는 수록하지 않았다. 20자 안팎의 짧은 응답과 진행 승인, 상태 알림, 확인 질문, 상황에 묶인 오류 보고가 여기에 해당한다.
>
> 둘째, 항목은 다섯이다. 목적, 전제, 프롬프트, 완료 기준, 비고이다. 가운데의 프롬프트가 그대로 입력하는 본문이고 그 앞뒤는 재현에 필요한 조건이다. 대괄호는 각자의 환경에 맞게 바꾸는 자리이다. 역할과 출력 형식은 고정 항목으로 두지 않고, 결과에 영향을 주는 경우에만 프롬프트 본문 안에 문장으로 넣었다.
>
> 셋째, 선별의 기준은 구현된 기능이다. 원자료를 훑어 재사용할 만한 발화를 고르는 방식으로는 그것을 만든 대화가 짧거나 기록에 남지 않은 기능이 빠진다. 이에 구현된 주요 기능마다 그것을 재현할 프롬프트를 하나씩 두었다.
>
> 넷째, 근거를 구분하여 밝힌다. 원자료에 요구가 적혀 있는 것이 17건이고, 착수한 사실만 남아 있거나 대응하는 발화가 기록에 없어 구현된 지시문과 저장 구조에서 요구를 거꾸로 정리한 것이 20건이다. 어느 쪽인지는 각 항목의 비고에 적었다. 표제에 「원자료 없음」을 표시한 A-1-01은 플러그인의 초기 뼈대에 해당하며, 그 단계의 대화가 기록으로 남지 않았다.
>
> 다섯째, 특정 언어와 서비스의 이름은 넣지 않았다. 「목표어」와 「학습자의 모어」로 적은 것은 본 연구가 중국어와 한국어를 다루었으나 절차 자체는 언어에 매이지 않기 때문이다. 실제로 사용한 모델과 판본, 생성 설정은 3.1.1(Claude Code와 워드프레스 스튜디오 연동 개발 환경)과 4.1.2(Claude Code와 Railway·GitHub 연동 개발 환경)에 밝혔다.

</details>

## 시스템 내장 프롬프트

> 4장에서 다룬 학습 웹앱의 지시문 17건이다. 여러 생성 기능에 결합되는 퀴즈 규격을 앞에 두고, 학습 영상, 레슨과 부속 콘텐츠, 학습송, 교수자 지원, 학습도우미의 차례로 수록한다.

| 번호 | 지시문 | 출처 (기준 커밋의 파일·행) |
|---|---|---|
| [A-3-01](system/A-3-01.md) | 퀴즈 규격 | `quiz-normalize.ts` [551~561행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/quiz-normalize.ts#L551-L561) |
| [A-3-02](system/A-3-02.md) | 학습 영상 대본 생성 | `video/pipeline.server.ts` [258~284행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/pipeline.server.ts#L258-L284) |
| [A-3-03](system/A-3-03.md) | 나레이션 번역 보정 | `video/translate.server.ts` [53~56행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/translate.server.ts#L53-L56) · [58~64행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/translate.server.ts#L58-L64) · [66~81행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/translate.server.ts#L66-L81) |
| [A-3-04](system/A-3-04.md) | 영상 기반 세부 강의 보강 | `video/lesson-enrich.server.ts` [68~71행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/lesson-enrich.server.ts#L68-L71) · [73~97행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/lesson-enrich.server.ts#L73-L97) · [113~114행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/lesson-enrich.server.ts#L113-L114) |
| [A-3-05](system/A-3-05.md) | 영상 주제 제안 | `video/studio.functions.ts` [325행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/video/studio.functions.ts#L325) |
| [A-3-06](system/A-3-06.md) | 세부 강의 생성 | `generate-lesson.functions.ts` [143~156행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/generate-lesson.functions.ts#L143-L156) · [158~196행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/generate-lesson.functions.ts#L158-L196) · [224~225행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/generate-lesson.functions.ts#L224-L225) |
| [A-3-07](system/A-3-07.md) | 문화 카드 생성 | `cultural-cards.functions.ts` [62~65행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/cultural-cards.functions.ts#L62-L65) · [70~86행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/cultural-cards.functions.ts#L70-L86) |
| [A-3-08](system/A-3-08.md) | 단어 연습 문제 생성 | `vocab-practice.functions.ts` [70~75행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/vocab-practice.functions.ts#L70-L75) · [77~102행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/vocab-practice.functions.ts#L77-L102) |
| [A-3-09](system/A-3-09.md) | 학습송 작사 | `songs.functions.ts` [967~972행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/songs.functions.ts#L967-L972) · [974~987행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/songs.functions.ts#L974-L987) |
| [A-3-10](system/A-3-10.md) | 학습송 가사 병음·번역 | `songs.functions.ts` [762~769행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/songs.functions.ts#L762-L769) |
| [A-3-11](system/A-3-11.md) | 학습송 학습 콘텐츠 생성 | `songs.functions.ts` [576~577행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/songs.functions.ts#L576-L577) · [578~587행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/songs.functions.ts#L578-L587) |
| [A-3-12](system/A-3-12.md) | 수업 지도안 생성 | `curriculum.functions.ts` [95~159행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/curriculum.functions.ts#L95-L159) · [195~196행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/curriculum.functions.ts#L195-L196) |
| [A-3-13](system/A-3-13.md) | 지도안 연계 콘텐츠 추천 | `curriculum.functions.ts` [403~404행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/curriculum.functions.ts#L403-L404) · [405~427행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/curriculum.functions.ts#L405-L427) |
| [A-3-14](system/A-3-14.md) | 학습송–세부 강의 연계 추천 | `content-links.functions.ts` [109~110행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/content-links.functions.ts#L109-L110) · [111~127행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/content-links.functions.ts#L111-L127) |
| [A-3-15](system/A-3-15.md) | 학습도우미 응답 | `assistant.functions.ts` [28~52행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assistant.functions.ts#L28-L52) |
| [A-3-16](system/A-3-16.md) | 오늘의 명언 풀 생성 | `widgets.functions.ts` [83~84행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/widgets.functions.ts#L83-L84) · [85~92행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/widgets.functions.ts#L85-L92) |
| [A-3-17](system/A-3-17.md) | ASSURE 교수설계 단락 | `assure.ts` [337~365행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L337-L365) · [294~298행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L294-L298) · [30~67행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L30-L67) · [300~307행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L300-L307) · [309~315행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L309-L315) · [317~324행](https://github.com/nanalyn12/web-dingdong/blob/db7a88802cdc57a0d3266a3028d7d9eba85854ab/src/lib/assure.ts#L317-L324) |

<details>
<summary>수록 원칙 (논문 부록 A-2·A-3)</summary>

> 첫째, 소스 코드에서 직접 추출하였다. 별도로 정리해 둔 문서가 아니라 실제로 동작하는 코드를 대상으로 하였으며, 각 항목에 파일 경로와 줄 번호를 함께 표시하여 대조할 수 있게 하였다.
>
> 둘째, 원문을 그대로 옮긴다. 코드에서 값이 채워지는 자리는 그 표기 그대로 두었다. 실행 시점에 강좌명이나 난이도와 같은 값이 이 자리에 들어간다.
>
> 셋째, 하나의 모델 호출을 하나의 항목으로 삼는다. 역할 지정과 지시가 코드에서 서로 다른 변수에 담겨 있더라도 같은 호출로 전달되면 한 항목으로 묶고, 항목 안에서 부분을 나누어 보였다. 호출의 단위가 곧 모델이 받는 지시의 단위이기 때문이다.
>
> 넷째, 여러 지시문에 되풀이하여 결합되는 부분은 별도의 항목으로 한 번만 수록한다. 결합하는 쪽에서는 결합한다는 사실만 밝힌다. 공통 표기 규칙과 이미지의 공통 화풍·인물 일관성, 퀴즈 규격이 여기에 해당한다.
>
> 다섯째, 호출되지 않는 지시문은 수록하지 않는다. [3.4.2 학습만화와 이미지 생성]에서 기술한 통이미지 방식의 만화 지시문은 정의만 남아 있고 호출하는 곳이 없어 제외하였다. 개별 이미지 생성으로 방식을 바꾸면서 쓰이지 않게 된 것이다.

</details>
