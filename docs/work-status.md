# SYNK 작업 현황판

> 모든 Claude 세션은 작업 시작 전 이 파일을 반드시 읽고, 작업 완료 후 업데이트합니다.
> 이 파일만 읽으면 현재 프로젝트 상태를 완전히 파악할 수 있어야 합니다.

---

## 현재 상태

**프로덕션 코드**: 나레이션 구조 개선 적용 (스키마 필드 순서 변경 + narrator-dialogue 교대 + minItems 6 복원)
**마지막 실험**: 나레이션 품질 개선 3건 (03-03) — 스키마 필드 순서/교대 힌트/첫턴 보장
**미결 사항**: Pro 비용 $0.031/턴 수용 여부, 나레이션 개선 효과 추가 검증 필요

---

## 태스크 목록

### 대기 (TODO)

| # | 태스크 | 내용 | 우선순위 |
|---|--------|------|:---:|
| ~~T1~~ | ~~uuid 패키지 제거~~ | ~~완료 (03-03)~~ | ~~-~~ |
| ~~T2~~ | ~~Prisma import 통일~~ | ~~완료 (03-03)~~ | ~~-~~ |
| ~~T3~~ | ~~ESLint 초기 설정~~ | ~~완료 (03-03)~~ | ~~-~~ |

### 보류 (HOLD)

| # | 태스크 | 사유 |
|---|--------|------|
| H1 | legacy imageGeneration.ts 정리 | 이미지 생성 기능 구현 보류 중. `generate-image/route.ts`에서 import 중이라 삭제 불가. 기능 재개 시 함께 처리 |

### 완료 (DONE)

| # | 태스크 | 완료일 | 비고 |
|---|--------|:---:|------|
| T1 | uuid 패키지 제거 | 03-03 | `uuid` + `@types/uuid` 삭제. 코드 미사용 의존성 정리 |
| T2 | Prisma import 통일 | 03-03 | named import 11곳 → default import. `narrative-memory.ts` PrismaClient 직접 생성 → 싱글턴 import. `auth.ts`는 NextAuth 어댑터 구조상 유지 |
| T3 | ESLint 초기 설정 | 03-03 | `eslint@8` + `eslint-config-next@14` + `@typescript-eslint`. `next/core-web-vitals` Strict. 에러 0건 |

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
- **turns description**: `'narrator로 시작, narrator와 dialogue 교대 배열'`
- **구조**: turns minItems 6, plotEvent, maxOutputTokens 12288
- **첫 턴 보장**: 비스트리밍 경로에서 첫 턴이 dialogue면 가장 가까운 narrator와 위치 교환 (코드)

### 경쟁사 대비 (Run 19 기준)

| 축 | 등급 |
|----|------|
| 물리적 동작 | ★★★★ |
| 감각묘사(다채널) | ★★★★ |
| 캐릭터 능동성 | ★★★★ |
| 캐릭터 수 | ★★★★+ (T2부터 4캐릭터) |
| T1 긴장감 | ★★★☆ (Opening 구조 한계) |
| 씬 구조(기승전결) | ★★★★★ (Pro 디렉팅) |

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

# 메모리 회상 테스트 (60/150턴)
npx tsx scripts/test-memory-simulation.ts \
  --scenario=default --turns=60 \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=..."
```

> ⚠️ 배포 확인 필수: 코드 push 후 Vercel 배포 완료를 확인한 뒤 테스트
> ⚠️ calcProCost 가격 오류: 분석 모델을 Flash로 전환 시 스크립트의 PRICING.pro 기준 비용이 과대표시됨

---

## 관련 문서

| 파일 | 내용 |
|------|------|
| `docs/prompt-experiment-log.md` | Run 6~30 실험 상세 (변경/결과/교훈) |
| `docs/memory-architecture.md` | 메모리 시스템 아키텍처 |
| `docs/image-generation-architecture.md` | 이미지 생성 아키텍처 |
| `docs/competitor-reference.md` | 경쟁사 벤치마크 원문 |
| `docs/competitor-sample.md` | 경쟁사(BabeChat) 실제 출력 샘플 |
| `docs/chat-system-architecture.md` | 채팅 시스템 아키텍처 (프롬프트/스키마/메모리 전체 흐름) |
| `docs/design-narrator-improvement.md` | 나레이션-대사 교대 구조 개선 설계 |
| `CLAUDE.md` | 프로젝트 규칙, Agent Teams 운영 규칙 |

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
| 03-03 | bkit 플러그인 비활성화 | Claude 네이티브 Agent Teams와 충돌 해결. `~/.claude/settings.json`에서 bkit 비활성화 |

---

> 마지막 업데이트: 2026-03-03 (나레이션 구조 개선 3건 + 아키텍처 문서 + bkit 비활성화)
