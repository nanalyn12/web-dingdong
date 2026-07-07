## 문제 진단

병음/한국어 토글을 켜도 아무것도 안 나오는 이유는 **데이터가 비어 있기** 때문입니다.

현재 Suno 파이프라인:
1. `draftSongFromKeyword` (Gemini) → **중국어 가사만** 반환
2. 사용자가 그대로 제출 → `parseLyrics()`는 `zh | pinyin | ko` 파이프 구분자를 기대 (Suno 초안엔 없음)
3. `parsedLyrics = [{ zh, pinyin: "", ko: "" }, ...]`로 저장
4. 상세 페이지에서 토글해도 렌더링할 값이 없음

큐레이팅(YouTube) 곡은 별도 폼에서 pinyin/translation을 직접 넣기 때문에 정상.

## 변경 계획

### 1) `src/lib/songs.functions.ts` — 병음·번역 생성

- **내부 헬퍼** `annotateLyricsInternal(lines: string[]): Promise<{ pinyin: string[]; ko: string[] }>`:
  - Gemini(`google/gemini-3-flash-preview`, 기존 `createLovableAiGatewayProvider` 재사용)로 라인별 병음(성조 기호)과 한국어 번역 생성
  - 섹션 헤더 `[Verse]` / `[Chorus]`는 pinyin/ko를 빈 문자열
  - JSON 스키마: `{"lines":[{"pinyin":"...","ko":"..."}, ...]}`, 길이 불일치 시 패딩/트림
  - 429/402/파싱 실패 시 명확한 에러 문자열 리턴 (throw 대신 옵셔널)

- **`draftSongFromKeyword` 확장**:
  - 반환 타입에 `pinyin: string[]`, `translation: string[]` 추가
  - 가사 초안 후 같은 핸들러에서 `annotateLyricsInternal` 호출, 실패해도 가사는 반환 (빈 배열)

- **`generateSongWithSuno` 안전망**:
  - `parsedLyrics`에서 실제 가사 라인 중 pinyin/ko가 모두 비어 있으면 저장 직전 `annotateLyricsInternal`로 보강
  - Suno에 보내는 `prompt`는 지금처럼 순수 중국어 유지 (병음은 UI 표시용)

- **신규 서버 함수** `reannotateSong({ songId })` (editor 권한):
  - 해당 song row의 `lyrics` 배열에서 zh만 뽑아 `annotateLyricsInternal` 호출
  - 반환된 pinyin/ko를 각 라인에 병합 (기존 `time` 유지, 섹션 헤더는 빈 값 유지)
  - `songs.lyrics` + `songs.pinyin`/`translation` 컬럼 업데이트, 갱신된 row 반환

### 2) `src/routes/_app.songs.index.tsx` — 생성 폼

- `draftMutation` 성공 시 `res.pinyin` / `res.translation`을 별도 state(`draftedPinyin`, `draftedKo`)에 저장
- 가사 textarea 아래에 접힘 카드(`<details>`): "AI가 채운 병음/번역 미리보기" — 라인별 3열(zh | pinyin | ko) 그리드 표시 (읽기 전용, 편집은 다음 이터레이션)
- `parseLyrics(raw)` 개선:
  - 파이프가 있으면 지금처럼 파싱
  - 없으면 라인 인덱스 기반으로 draft state의 pinyin/ko를 매칭해 `parsedLyrics` 구성
- `generateSongWithSuno` 호출 시 이 병합된 `parsedLyrics` 전달

### 3) `src/routes/_app.songs.$id.tsx` — 기존 곡 백필 버튼

- 상단 헤더(editor일 때만) "🔁 병음/번역 다시 만들기" 버튼
- 클릭 → `reannotateSong({ songId })` 뮤테이션 → 성공 시 song 쿼리 invalidate + 토스트 "병음/번역이 업데이트되었어요"
- 진행 중엔 스피너, 실패 시 에러 토스트 (Gemini 실패 메시지 그대로)
- editor 판별은 기존 페이지의 role 판단 로직 재사용

## 기술 노트

- Gemini 프롬프트 (요약):
  ```
  아래 중국어 학습송 가사에 각 라인의 병음(성조 기호 포함)과 한국어 번역을 붙여줘.
  섹션 헤더([Verse]/[Chorus] 등)는 pinyin과 ko를 빈 문자열로.
  라인 순서와 개수는 반드시 입력과 동일.
  JSON만 반환: {"lines":[{"pinyin":"...","ko":"..."}, ...]}
  ```
- 모델: `google/gemini-3-flash-preview` (기존 `LOVABLE_API_KEY` 재사용, 신규 시크릿 없음)
- 안전 처리: 응답 라인 수 < 입력 → 빈 값 패딩, > 입력 → 잘라냄, 파싱 실패 → 사용자에게 명확한 안내
- DB 변경 없음 — 기존 `songs.lyrics` (jsonb), `pinyin` / `translation` (text[]) 컬럼 재사용

## 범위 밖

- 워드 단위 병음 정렬(ruby)
- 라인별 인라인 편집 UI
- 자동 타임코드 정렬
- MP4 파이프라인

## 검증 체크리스트

- 신규 학습송: "AI 가사 생성" 후 미리보기에 zh/pinyin/ko 3열이 채워짐 → 생성 후 상세에서 병음/한국어 토글 ON 시 즉시 표시
- 기존 곡 상세에서 "병음/번역 다시 만들기" 클릭 → 몇 초 뒤 페이지에 병음·번역 표시
- pinyin/translation이 이미 있는 큐레이팅 곡은 무해 (백필 버튼도 정상 작동해 덮어씀 가능)
- Gemini 실패해도 곡 생성 자체는 진행되고 토스트로 안내
