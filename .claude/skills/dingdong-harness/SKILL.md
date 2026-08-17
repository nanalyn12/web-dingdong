---
name: dingdong-harness
description: "dingdong 웹앱(중국어 학습 플랫폼)의 코드 변경을 조율하는 오케스트레이터. 새 기능 추가, 버그 수정, 리팩터, 스키마 변경, AI 연동 변경 등 이 저장소의 소스를 고치는 모든 작업에서 반드시 이 스킬을 사용할 것. 후속 작업 — 기준 수정, 부분 재실행, 게이트 실패 재수정, 업데이트, 보완, 다시 실행, 이전 결과 개선 요청 시에도 반드시 이 스킬을 사용."
---

# dingdong Harness Orchestrator

dingdong 웹앱의 코드 변경을 **기준 먼저 → 실패 확인 → 구현 → 게이트 통과** 순서로 조율하는 통합 스킬.

## 실행 모드: 하이브리드

| Phase                    | 모드          | 이유                                                                                 |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------ |
| Phase 1 분석             | 서브 에이전트 | 단독 읽기 작업, 팀 통신 불필요                                                       |
| Phase 2~4 Red→Green→검증 | 에이전트 팀   | test-author ↔ feature-builder ↔ qa-verifier 간 실시간 반려·재작업 루프가 품질의 핵심 |
| Phase 5 정리             | 리더 단독     | 산출물 종합                                                                          |

> 변경 범위가 파일 1~2개의 국소 수정이면 팀을 만들지 않고 리더가 각 역할의 규칙을 직접 따라 순차 실행해도 된다. 팀 오버헤드가 이득을 넘는 구간이다. 단 **순서(기준 → Red → Green → 게이트)는 규모와 무관하게 생략하지 않는다.**

## 에이전트 구성

| 팀원            | 에이전트 타입            | 역할                          | 스킬                      | 출력                                                          |
| --------------- | ------------------------ | ----------------------------- | ------------------------- | ------------------------------------------------------------- |
| spec-analyst    | spec-analyst (커스텀)    | 요구사항 → L1/L2/L3 합격 기준 | —                         | `_workspace/01_spec-analyst_criteria.md`                      |
| test-author     | test-author (커스텀)     | 실패 테스트 작성 + Red 확인   | tdd-cycle                 | `src/**/*.test.ts`, `_workspace/02_test-author_red-report.md` |
| feature-builder | feature-builder (커스텀) | 최소 구현 + 리팩터            | tdd-cycle, secret-hygiene | 구현 코드, `_workspace/03_feature-builder_evidence.md`        |
| qa-verifier     | qa-verifier (커스텀)     | L1·L2 게이트 + 경계면 대조    | interface-crosscheck      | `_workspace/04_qa-verifier_verdict.md` 또는 `_feedback.md`    |

모든 Agent/TeamCreate 호출에 `model: "opus"`를 명시한다.

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 존재 여부를 확인한다.
2. 실행 모드를 결정한다:
   - **미존재** → 초기 실행. Phase 1로.
   - **존재 + 부분 수정 요청** → 부분 재실행. 해당 에이전트만 재호출하고 그 산출물만 덮어쓴다.
   - **존재 + 새 입력** → 새 실행. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 옮긴 뒤 새로 만든다.
3. 부분 재실행 시 이전 산출물 경로를 에이전트 프롬프트에 넣어, 기존 결과를 읽고 피드백만 반영하게 한다.

### Phase 1: 기준 확정 (기준이 코드보다 먼저)

**실행 모드:** 서브 에이전트

1. `Agent(subagent_type: "spec-analyst", model: "opus")`로 요청을 분석시킨다.
2. 산출물 `_workspace/01_spec-analyst_criteria.md`에 **L1 항목이 하나 이상** 있는지 확인한다. 없으면 반려하고 다시 요청한다 — 기계가 판정할 수 없는 기준만으로는 게이트를 세울 수 없다.
3. `## 미결 질문`이 남아 있으면 사용자에게 물어 확정한 뒤 진행한다.

**이 Phase를 건너뛰고 Phase 3으로 갈 수 없다.** 기준이 없는 상태에서 구현을 시작하면 "이 정도면 됐나"를 구현자가 스스로 판정하게 되고, 그 판정은 매번 느슨해진다.

### Phase 2: Red — 실패 확인

**실행 모드:** 에이전트 팀 (또는 국소 변경 시 리더 순차 실행)

1. test-author가 L1 기준을 `*.test.ts`로 옮긴다.
2. `npx vitest run <대상 경로>`를 실행해 **실패를 확인**하고 원출력을 `02_test-author_red-report.md`에 붙인다.
3. 예상과 달리 처음부터 통과하면 멈추고 리더에게 보고한다.

### Phase 3: Green — 최소 구현

1. feature-builder가 실패 테스트를 통과시키는 최소 구현을 쓴다.
2. 테스트 파일은 수정하지 않는다. 기준이 틀렸다고 판단되면 SendMessage로 test-author에게 반송한다.
3. 통과 후 리팩터는 자유다 — 단 **같은 기준을 계속 통과해야 한다.** 리팩터 후 테스트를 다시 돌린다.

### Phase 4: 게이트 — L1·L2 채점

1. qa-verifier가 네 게이트를 직접 실행한다:

   ```
   npm run verify   # = vitest run → tsc --noEmit → lint → build
   ```

   게이트가 깨졌을 때는 개별 명령으로 좁혀 본다: `npx vitest run`, `npx tsc --noEmit`,
   `npm run lint`, `npm run build`.

2. 경계면 교차 검증(`interface-crosscheck`)을 수행한다.
3. 판정:
   - **통과** → `04_qa-verifier_verdict.md` 작성, Phase 5로.
   - **미달** → `04_qa-verifier_feedback.md`에 실패 명령·원출력·재현 경로를 담아 feature-builder에게 SendMessage. Phase 3으로 되돌아간다.
4. **반복 상한 3회.** 3회 후에도 미달이면 미수렴으로 표시하고 사용자에게 판단을 넘긴다. 무한 루프는 토큰만 태운다.

### Phase 5: 정리

1. 팀 모드였다면 팀을 정리한다(TeamDelete).
2. `_workspace/`는 지우지 않는다 — 사후 검증·감사 추적용.
3. 사용자에게 보고한다: 무엇을 바꿨는지, 게이트 결과, 남은 미결 항목.
4. `CLAUDE.md`의 변경 이력 테이블에 한 줄 추가한다.

## 데이터 흐름

```
[리더] → Agent(spec-analyst) → 01_criteria.md
                                    │
                                    ▼
        [test-author] ──Red 통지──▶ [feature-builder]
              │                          │
        02_red-report.md          03_evidence.md
              │                          │
              └────────▶ [qa-verifier] ◀─┘
                              │
                    통과 ─────┴───── 미달 → 04_feedback.md → feature-builder
                      │
                04_verdict.md → [리더 종합]
```

## 게이트 정의 (L1·L2·L3)

| Layer | 성격           | 이 프로젝트의 물리화                                             | 판정 주체                       |
| ----- | -------------- | ---------------------------------------------------------------- | ------------------------------- |
| L1    | 기계적 binary  | `vitest run`, `tsc --noEmit`, `npm run lint` (errors 0)          | 자동                            |
| L2    | 관찰 가능 행위 | `npm run build` (Nitro node-server 산출), 마이그레이션 적용 결과 | 자동                            |
| L3    | 주관           | UX 문구, 한국어 자연스러움, 코드 가독성                          | qa-verifier가 rubric으로 코멘트 |

**DB 통합 테스트와 E2E는 현재 게이트 범위 밖이다.** 테스트 대상은 DB·네트워크에 의존하지 않는 순수 로직으로 한정하고, 나머지는 L2 빌드와 경계면 대조로 커버한다. 범위를 넓힐 때는 이 표를 먼저 고친다.

## 에러 핸들링

| 상황                         | 전략                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| 합격 기준에 L1이 없음        | spec-analyst에 반려. 순수 함수로 분리 가능한지 재검토                               |
| Red가 처음부터 통과          | 중단 후 보고. 테스트가 아무것도 검증하지 않을 가능성                                |
| 게이트 1회 실패              | feature-builder가 1회 재시도                                                        |
| 게이트 3회 실패              | 미수렴 표시 + 사용자 개입 권고, 부분 결과 보존                                      |
| 환경 문제로 게이트 실행 불가 | 코드 미달과 구분해 보고                                                             |
| 팀원 실패/중지               | 리더가 SendMessage로 상태 확인 → 재시작 또는 리더가 해당 역할 직접 수행             |
| 기준 변경 필요               | 구현 중 임의 완화 금지. Phase 1로 되돌아가 기준을 명시적으로 갱신하고 이력에 남긴다 |

## 테스트 시나리오

### 정상 흐름

1. 사용자가 "복습 간격 계산에 연속 정답 보너스를 넣어줘"라고 요청.
2. Phase 1 — spec-analyst가 `src/lib/vocab-srs.ts` 영향, L1 기준 4개(연속 2·3·4회 정답 시 간격, 오답 시 초기화) 산출.
3. Phase 2 — test-author가 `vocab-srs.test.ts`에 4 케이스 추가, `npx vitest run` 실패 4건 확인.
4. Phase 3 — feature-builder가 보너스 로직 구현, 로컬 테스트 통과.
5. Phase 4 — qa-verifier가 4개 게이트 전부 PASS, 경계면(호출부 시그니처) 이상 없음 확인.
6. Phase 5 — 변경 이력 기록 후 보고.

### 에러 흐름

1. Phase 4에서 `npx tsc --noEmit`이 호출부 타입 불일치로 FAIL.
2. qa-verifier가 `04_feedback.md`에 tsc 원출력 + 해당 파일·라인을 기록하고 feature-builder에 SendMessage.
3. feature-builder가 호출부를 함께 수정(테스트는 손대지 않음).
4. qa-verifier 재실행 → 전부 PASS.
5. 최종 보고에 "게이트 1회 반려 후 통과" 명시.
