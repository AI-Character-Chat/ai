# SYNK 작업 현황판

> 모든 Claude 세션은 작업 시작 전 이 파일을 반드시 읽고, 작업 완료 후 업데이트합니다.
> 이 파일만 읽으면 현재 프로젝트 상태를 완전히 파악할 수 있어야 합니다.

---

## 현재 상태

**프로덕션 코드**: Run 34 (Q1 turns desc + Q2.5 reactTo) 적용 — 캐릭터 상호작용 9/10, 말투 10/10, $0.033/턴
**마지막 작업**: Q2.5 reactTo thinking aid 테스트 완료 — 부작용 없이 유지, 프로덕션 적용 (03-04)
**미결 사항**: Medium/Low 53건 잔여

---

## 태스크 목록

### 대기 (TODO)

| # | 태스크 | 내용 | 우선순위 |
|---|--------|------|:---:|
| T4 | 코드 리뷰 Medium 수정 | 30건 (보안 8 + AI Core 7 + Memory 7 + Frontend 8+3) | 중 |
| T5 | 코드 리뷰 Low 수정 | 23건 (AI 5 + Security 6 + Memory 3 + Frontend 9) | 낮 |
| T6 | Pro 비용 최적화 결정 | Pro 격턴 실행 or 비용 수용 | 중 |

### 보류 (HOLD)

| # | 태스크 | 사유 |
|---|--------|------|
| H1 | legacy imageGeneration.ts 정리 | 이미지 생성 기능 구현 보류 중. `generate-image/route.ts`에서 import 중이라 삭제 불가. 기능 재개 시 함께 처리 |

### 완료 (DONE)

| # | 태스크 | 완료일 | 비고 |
|---|--------|:---:|------|
| Q2.5 | reactTo thinking aid (Run 34) | 03-04 | 부작용 없이 유지. TTFT -13%, 비용 -11%. 말투 10/10, 상호작용 9/10. 프로덕션 적용 |
| Q3 | 자연 대화 기억력 테스트 (Run 33) | 03-04 | 35.0% (7/20). 대본형 80.2%와 방법론 차이로 직접 비교 불가. T60 종합리콜에서 더 많이 기억 확인 |
| Q2 | Pro 디렉터 상호작용 지시 (Run 32) | 03-04 | Q1 위에 추가 효과 미미. Pro N/A 2/10. 리버트 완료 |
| Q1 | turns desc 교대 규칙 유연화 (Run 31) | 03-04 | 엄격→유연 교대. 캐릭터 상호작용 6/10→8~9/10 개선. 비용 $0.037/턴 |
| QA1 | 경쟁사 대화 구조 분석 | 03-04 | 5축 비교, 핵심 갭=캐릭터 상호작용(6/10 vs 9/10). 개선 방향 5개 도출 |
| QA2 | 자연 대화 기억력 테스트 스크립트 | 03-04 | AI 유저 역할 + 5단계 Phase + AI 자동 판정. `scripts/test-natural-conversation.ts` |
| QA3 | 메모리 안정성 점검 | 03-04 | 4함수 전부 안정. 선택적 개선: similarity threshold 0.3 |
| T1 | uuid 패키지 제거 | 03-03 | `uuid` + `@types/uuid` 삭제 |
| T2 | Prisma import 통일 | 03-03 | named import 11곳 → default import |
| T3 | ESLint 초기 설정 | 03-03 | `eslint@8` + `eslint-config-next@14` + `@typescript-eslint` |
| CR1 | 코드 리뷰 1차: IDOR/인가 | 03-04 | C1,C2,H1-H3 + chat GET — 보안 취약점 6건 수정 |
| CR2 | 코드 리뷰 2차: JSON.parse 보호 | 03-04 | C4,C8 + narrative-memory 11곳 + pro-analyze + prompt-builder — 15곳 |
| CR3 | 코드 리뷰 3차: select 최적화 | 03-04 | C5,H11 + consolidateMemories — embedding 대량 로딩 방지 |
| CR4 | 코드 리뷰 4차: race condition | 03-04 | H12 P2002 catch + H14 $transaction — 동시 접속 값 오염 방지 |
| CR5 | 코드 리뷰 5차: page.tsx 리팩토링 | 03-04 | C6,C7 — 2596줄→211줄, useState 57→7개, 6개 컴포넌트 추출 |

---

## 개발 트랙 (Phase 순서)

### Phase 1: 기반 구축 (완료)
- Next.js 14 + Prisma + Gemini Flash 채팅 시스템
- 다중 캐릭터 대화, 로어북, 오프닝 시스템
- NextAuth (카카오/구글) 인증
- Vercel Blob 이미지 업로드/생성
- 소셜 기능 (팔로우, 좋아요, 댓글, 신고)

### Phase 2: 메모리 시스템 (완료, v5~v8)
- Mem0 → 자체 DB 메모리 전환 (월 $19~249 절약)
- narrative-memory: 관계/감정/장면 기억 (Prisma 기반)
- 임베딩 기반 기억 검색 (Gemini embedding)
- Cross-session 메모리 (MemoryScope 패턴)
- 영구 기억 전환 (decay/pruning 제거)
- Surprise-based filtering (Titans 개념)
- **결과**: 기억 회상률 32.7% → 77.6% (150턴 테스트)

### Phase 3: 프롬프트 최적화 (완료, v9~v10)
- Ablation 테스트 17회 (Test G~T)
- 2줄 체제 확정: role(1줄) + compound(1줄)
- post-history 리마인더: "말투 유지" 1줄
- thinkingBudget: 512
- RESPONSE_SCHEMA description 최소화
- **결과**: 말투 10/10, 비용 $0.00135/turn

### Phase 4: 스토리 정체 해결 (완료, Run 1~6)
- 근본 원인: recentEvents 미전달 + 자기강화 루프
- plotEvent 스키마 필드 추가 → 스토리 진행 3/5 → 5/5
- 말투 드리프트 3차 수정 (description 최소화가 핵심)
- **결과**: 말투 10/10, 스토리 5/5, 벨벳 전 턴 등장

### Phase 5: 경쟁사 대비 묘사 품질 개선 (완료, Run 7~23)
- 17회 실험으로 최적 설정 도출
- 핵심: thinking aid 패턴, 제한 제거 원칙, 필드 분리, description 최소화
- **결과**: 5축 중 4축 경쟁사 동등(★★★★), T1 긴장감만 ★★★☆

### Phase 6: Pro 디렉팅 + 기승전결 + 비용 최적화 (완료, Run 24~30)
- Pro 백그라운드 분석 → Flash 디렉터 노트 주입 파이프라인
- sceneBeat + arcPhase(기승전결) + turnCount → 씬 순환 성공 (Run 25)
- 비용 최적화 6회 시도 → Pro 비용 ~$0.027/턴이 고정 하한선
- **상세 기록**: `docs/prompt-experiment-log.md` (Run 24~30)

---

## 프로덕션 설정

### 프롬프트 체계
- **systemInstruction**: 2줄 (role 1줄 + compound 1줄)
- **post-history 리마인더**: "※ 각 캐릭터 말투를 설정 그대로 유지" (1줄)
- **thinkingBudget**: 512 (Flash 채팅), 4096 (Pro 분석)
- **Pro 디렉터 프롬프트**: 관계 JSON + arcPhase + sceneBeat + directing (~250자)

### RESPONSE_SCHEMA
- **필드 순서**: type → character → sensory → ambience → characterAction → content → emotion → emotionIntensity (thinking aid가 content 앞에 위치)
- **thinking aid** (출력 미포함): sensory, ambience, characterAction — 제한 없음
- **출력 사용 필드**: emotion — `'dialogue일 때 표정. narrator일 때 "neutral".'` (제한 유지 필수)
- **turns description**: `'narrator로 시작. 캐릭터 전환 시 narrator 삽입 권장.'` (Run 31에서 유연화)
- **구조**: turns minItems 6, plotEvent, maxOutputTokens 12288
- **첫 턴 보장**: 비스트리밍 경로에서 첫 턴이 dialogue면 가장 가까운 narrator와 위치 교환 (코드)

### 경쟁사 대비 (최신 구조 분석, 03-04)

| 축 | 경쟁사 | SYNK | 상태 | 개선 방향 |
|----|--------|------|------|-----------|
| 말투 일관성 | 10/10 | 10/10 | 동등 | - |
| 감각묘사 | 9/10 | 8/10 | 근접 | sensory/ambience thinking aid |
| 물리적 동작 | 9/10 | **8/10** | 근접 | Run 31 turns desc 유연화로 개선 |
| **캐릭터 상호작용** | 9/10 | **8~9/10** | **근접~동등** | Run 31 turns desc 유연화로 대폭 개선 (매 턴 4~6회 상호참조) |
| T1 긴장감 | 9/10 | **7/10** | 근접 | Opening 가이드라인 + 상호작용 개선 효과 |
| 씬 구조(기승전결) | - | ★★★★★ | SYNK 우위 | Pro 디렉팅 |

---

## 금지 사항 (과거 실험에서 확인됨)

| 접근법 | 결과 | 이유 |
|--------|------|------|
| post-history에 2개 이상 지시 | 모두 약화 | 어텐션 경쟁 |
| compound rule에 절 추가 | 말투 붕괴 | 이미 최적 길이 |
| thinkingBudget 1024 (Flash) | 규칙 무시 | minimal prompt에서 작동 안함 |
| 프롬프트 3줄 이상 | 품질 하락 | v10 2줄이 최적 |
| SDT를 프롬프트로 해결 (4번 시도) | 말투 불안정 | Q/R/S/T 전부 실패 |
| emotion 제한 제거 | 합니다체 퇴보 | 출력에 사용되는 필드는 제한 유지 |
| per-turn tension 필드 | 다캐릭터 소멸 | 방향성 thinking aid가 특정 캐릭터 편중 |
| scene-level stakes 필드 | 효과 없음 | scene-level은 너무 약함 |
| 관계 수치 자연어 변환 | 합니다체+캐릭터 소실 | 자연어가 나레이터 문체에 전이 |
| plotEvent desc에 창작지시 | 말투 드리프트 | 스키마 desc가 mini-prompt 역할 |
| plotEvent desc 영어 | 말투 3/10 | 영어가 레지스터 오염 |
| Pro thinkingBudget 제한 (512/1024) | 효과 없음 | Gemini Pro가 파라미터 무시 |

**원칙**: 품질 향상은 프롬프트가 아닌 다른 경로 (스키마 필드, 구조 변경 등)

---

## 인프라

| 항목 | 값 |
|------|-----|
| Vercel 리전 | icn1 (서울) |
| Neon DB 리전 | ap-southeast-1 (싱가포르) |
| AI 모델 (채팅) | gemini-2.5-flash |
| AI 모델 (분석) | gemini-2.5-pro (경량 systemInstruction + 축소 memoryContext) |
| AI 모델 (폴백) | gemini-2.5-pro-preview-06-05 |
| 비용 (채팅) | ~$0.007/턴 |
| 비용 (분석, Pro) | ~$0.027/턴 |
| TTFT (평균) | 5.5~6.5초 (Pro 분석 포함) |

---

## 테스트 실행 방법

```bash
# 품질 테스트 (10턴, 프로덕션)
npx tsx scripts/test-quality-comparison.ts \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=b1507ba0-5a32-4d2b-9cc6-5b923ec8ab69"

# 메모리 회상 테스트 (60/150턴, 기존 대본형)
npx tsx scripts/test-memory-simulation.ts \
  --scenario=default --turns=60 \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=..."

# 자연 대화 기억력 테스트 (AI가 유저 역할, 대본 없음)
npx tsx scripts/test-natural-conversation.ts \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=..." \
  --gemini-key=AIza... --turns=60
```

> ⚠️ 배포 확인 필수: 코드 push 후 Vercel 배포 완료를 확인한 뒤 테스트
> ⚠️ calcProCost 가격 오류: 분석 모델을 Flash로 전환 시 스크립트의 PRICING.pro 기준 비용이 과대표시됨

---

## 관련 문서

### 필독 문서 (새 세션에서 반드시 읽기)

| 순서 | 파일 | 용도 |
|:---:|------|------|
| 1 | `docs/session-handoff.md` | **세션 인수인계** — 현재 상태, 노션 ID, CEO 선호사항 |
| 2 | `docs/work-status.md` | **작업 현황판** — 태스크 목록, 개발 트랙, 세션 기록 |
| 3 | `CLAUDE.md` | **작업 규칙** — Agent Teams 운영, 단축어, 금지사항 |

### 기능 작업 시 참고

| 파일 | 내용 |
|------|------|
| `docs/code-review-2026-03-04.md` | 전체 코드 리뷰 81건 (수정 이력 포함) |
| `docs/chat-system-architecture.md` | 채팅 시스템 아키텍처 (프롬프트/스키마/메모리 전체 흐름) |
| `docs/memory-architecture.md` | 메모리 시스템 아키텍처 |
| `docs/prompt-experiment-log.md` | Run 6~32 실험 상세 (변경/결과/교훈) |

### 참고 (필요 시)

| 파일 | 내용 |
|------|------|
| `docs/image-generation-architecture.md` | 이미지 생성 아키텍처 |
| `docs/competitor-analysis-2026-03-04.md` | **경쟁사 구조 분석** — 5축 비교 + 개선 방향 5개 |
| `docs/competitor-comparison-test.md` | 경쟁사 vs SYNK 비교 테스트 시나리오 (10턴) |
| `docs/competitor-reference.md` | 경쟁사 벤치마크 원문 |
| `docs/competitor-sample.md` | 경쟁사(BabeChat) 실제 출력 샘플 |
| `docs/design-narrator-improvement.md` | 나레이션-대사 교대 구조 개선 설계 |

---

## 팀 운영 가이드

### 핵심 원칙: 항상 팀 단위 작업 (CEO 지시)
- **모든 작업은 팀을 구성하여 병렬로 진행한다**
- 단순 버그 1줄 수정 같은 극히 사소한 건만 예외
- 설계/구현/테스트 역할 명확히 분리하여 병렬 효율 극대화

### 우리 팀: quality-improvement

| 이름 | 모델 | 역할 | 소유 파일 (상세: CLAUDE.md 참조) |
|------|------|------|----------------------------------|
| 🏔️ **마루** (CTO) | Opus | 설계+조율 | `docs/*`, `CLAUDE.md` — 코드 수정 안 함 |
| 🔥 **루미** | Opus | AI+백엔드+보안 | `src/lib/gemini.ts`, `prompt-builder.ts`, `chat-service.ts`, `auth.ts`, `imageGeneration.ts`, `preview-parser.ts`, `logger.ts`, `src/middleware.ts`, `src/app/api/**` (25개 라우트) |
| 🐿️ **다람** | Opus | 메모리+DB+타입 | `src/lib/narrative-memory.ts`, `prisma.ts`, `prismaErrorHandler.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/types/*` |
| 🦋 **나래** | Opus | 프론트+접근성 | `src/app/**/page.tsx` (12개), `src/components/**` (25개), `src/contexts/**`, `src/hooks/**` |
| ✅ **바로** | Sonnet | QA 검증 전용 | 모든 파일 읽기 가능. **Edit/Write 금지** |

### 공유 파일 + 충돌 방지 규칙

| 공유 파일 | 주 소유자 | 규칙 |
|-----------|-----------|------|
| `src/types/index.ts` | 다람 | 나래도 수정 가능하나 **수정 전 상대방에게 메시지 필수** |
| `src/app/api/chat/route.ts` | 루미 | 메모리 관련 수정 시 다람에게 확인 |
| `src/components/chat/ChatContainer.tsx` | 나래 | API 호출 로직 변경 시 루미에게 확인 |

**경계 위반 금지**: 자기 목록에 없는 파일 수정 필요 시 → 마루에게 메시지 → 해당 소유자에게 전달. 직접 수정 절대 금지 (이전 사고: 다람이 루미 도메인 침범 → StoryResponse 삭제)

### 빠른 재시작 (새 세션에서)
```
1. docs/work-status.md 읽기 → 미완료 태스크 확인
2. TeamCreate → TaskCreate → Task로 루미/다람/나래/바로 spawn
3. 각 팀원 prompt에 반드시 포함: 이름 + 소유 파일 목록 + 수정금지 범위 + 보고 지시
4. 공유 파일(types/index.ts) 수정 태스크는 동시 2명 배분 금지
```

---

## 세션 기록

| 일자 | 작업 | 결과 |
|------|------|------|
| 02-26 | Phase 4: sensory 필드 추가, Run 1 | 36/40, 말투 10/10, 감각묘사 효과 확인 |
| 02-27 | Phase 4: plotEvent 구현 + 말투 드리프트 3차 수정 | Run 2~6. 말투 10/10 복원, 스토리 5/5 |
| 02-27 | Phase 5: 묘사 품질 실험 (Run 7~13) | thinking aid 패턴 발견, minItems 6, maxOutputTokens 12288 |
| 02-28 | Phase 5: 묘사 품질 실험 (Run 14~19) | 5축 중 4축 경쟁사 동등 달성 |
| 02-28 | Phase 5: 추가 실험 (Run 20~23) | emotion/tension/stakes/자연어 전부 실패 → Run 19 확정 |
| 03-02 | 메모리: extractedFacts/sharedExperiences 확장 | 팩트 추출률 개선 |
| 03-03 | Phase 6: Pro 디렉팅 (Run 24~25) | 기승전결 순환 성공 |
| 03-03 | Phase 6: 비용 최적화 (Run 26~30) | 모든 접근법 시도, $0.027/턴 하한선 확인 |
| 03-03 | 코드 정리 태스크 정리 | T1~T3 대기, H1 보류. work-status.md 재구성 |
| 03-03 | 나레이션 구조 개선 3건 | ① minItems 8→6 복원 ② 스키마 필드 순서 변경 (thinking aid→content) ③ turns desc 교대 힌트 + 첫턴 narrator 보장 코드. 나레이션 1~2문장→3~6문장 개선 확인 |
| 03-03 | 채팅 시스템 아키텍처 문서 추가 | `docs/chat-system-architecture.md` 작성 |
| 03-03 | bkit 플러그인 비활성화 | Claude 네이티브 Agent Teams와 충돌 해결 |
| 03-04 | 전체 코드 리뷰 (4명 Opus 병렬) | 81건 발견 (Critical 8 + High 20 + Medium 30 + Low 23) |
| 03-04 | 코드 리뷰 1차: IDOR/인가 수정 | C1,C2,H1-H3 + chat GET — 6건 보안 취약점 수정 |
| 03-04 | 코드 리뷰 2차: JSON.parse 보호 | 15곳 try-catch 추가 — 런타임 크래시 방지 |
| 03-04 | 코드 리뷰 3차: select 최적화 | 3함수 embedding 대량 로딩 방지 — 매 턴 ~400KB 절약 |
| 03-04 | 코드 리뷰 4차: race condition | P2002 catch + $transaction — 동시 접속 값 오염 방지 |
| 03-04 | 코드 리뷰 5차: page.tsx 리팩토링 | 2596줄→211줄, 6개 컴포넌트 추출. 프로덕션 배포+API 10건 검증 |
| 03-04 | 경쟁사 대화 구조 분석 | 5축 비교. 핵심 갭=캐릭터 상호작용(6/10). 개선 방향 5개 (Pro 디렉터, reactTo, Opening 가이드 등) |
| 03-04 | 자연 대화 기억력 테스트 스크립트 | AI 유저 역할 + 5단계 Phase + AI 자동 판정. `test-natural-conversation.ts` |
| 03-04 | 메모리 안정성 점검 | 4함수 전부 안정 (search, novelty, context, relationship). 선택: threshold 0.3 |
| 03-04 | **Q1: turns desc 유연화 (Run 31)** | desc 1줄 변경 → 캐릭터 상호작용 6/10→8~9/10 대폭 개선! 매 턴 4~6회 상호참조. 비용 $0.037/턴 |
| 03-04 | **Q2: Pro 디렉터 상호작용 지시 (Run 32)** | directing desc에 "리액션 포함" 추가. Q1 위에 추가 효과 미미, Pro N/A 2/10(20%). 리버트 권장 |
| 03-04 | **Q3: 자연 대화 기억력 테스트 (Run 33)** | 60턴 AI유저 역할. 35.0% (7/20). T60 종합리콜에서 추가 기억 확인. 대본형 80.2%와 방법론 차이 |
| 03-04 | **Q2.5: reactTo thinking aid (Run 34)** | 부작용 없이 유지. TTFT -13%, 비용 -11% ($0.033/턴). 말투 10/10, 상호작용 9/10 |
| 03-04 | 노션 동기화: Run 33-34 실험기록 | 노션 실험기록 페이지 Phase 10 업데이트 + 프로덕션 설정 reactTo 추가 |

---

> 마지막 업데이트: 2026-03-04 (Run 34 Q2.5 + Run 33 Q3 완료. 노션 동기화 완료)
