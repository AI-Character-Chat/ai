# Plan: response-restructure

## 개요

AI 캐릭터 챗의 응답 구조를 경쟁사 수준으로 개선. 현재 평면적인 `narrator + responses[]` 구조를 드라마틱한 `turns[]` 교차 구조로 변경하여, 나레이션과 대사가 자연스럽게 교차되고 멀티캐릭터 상호작용이 가능한 시스템을 구축한다.

## 배경 (경쟁사 비교 분석)

### 현재 (우리)
```
[나레이션 덩어리 4문장] → [ZERO 대사 1덩어리]
= 2블록, 환경 반복 묘사, 단일 캐릭터
```

### 목표 (경쟁사 수준)
```
[나레이션: 캐릭터 반응] → [ZERO 대사] → [나레이션: 행동] → [ZERO 대사]
→ [나레이션: 에코 등장] → [에코 대사] → [ZERO↔에코 대화] → [노바 등장]
= 10+ 블록, 캐릭터 반응 중심, 멀티캐릭터 상호작용
```

### 핵심 문제 3가지
1. **JSON Schema가 평면적** — narrator 1개 + responses 배열 → 교차 불가
2. **캐릭터 필터가 경직** — presentCharacters에 없으면 AI에 전달 안 됨
3. **프롬프트가 "묘사" 중심** — 스토리 진행/캐릭터 간 상호작용 지시 없음

## 요구사항

### R1. turns[] 교차 응답 구조 (JSON Schema 변경)
- **현재**: `{ narrator: string, responses: [{character, content, emotion}], scene }`
- **변경**: `{ turns: [{type, character?, content, emotion?}], scene }`
- turns 배열 안에 narrator와 dialogue가 교차 배치
- 같은 캐릭터가 여러 번 발화 가능
- 나레이션이 대사 사이에 위치 가능

### R2. 캐릭터 유기적 등장 시스템
- presentCharacters에 없는 캐릭터도 AI가 상황에 맞게 등장시킬 수 있어야 함
- systemInstruction에 **모든 캐릭터 정보** 전달 (현재: activeCharacters만)
- AI 응답의 scene.presentCharacters를 통해 등장 캐릭터 동적 업데이트
- 새 캐릭터 등장 시 외모+등장 묘사 필수 (기존 첫등장 가이드 활용)

### R3. 프롬프트 강화 (스토리 진행력)
- 나레이션: "환경 묘사"가 아닌 "캐릭터 반응/행동 묘사" 중심
- 매 턴 새로운 정보/이벤트/긴장감 도입 지시
- 캐릭터 간 상호작용 (서로에 대한 반응, 의견 충돌) 지시
- 대사와 행동 묘사 분리 (대사 안에 *행동* 넣지 말고 별도 narrator turn으로)
- "유저의 발언에 대한 캐릭터별 다중 관점 응답" 지시

### R4. SSE 스트리밍 + DB 저장 적응
- turns[] 배열을 순회하며 SSE 이벤트 순차 전송
- narrator turn → `event: narrator` 전송 + DB 저장
- dialogue turn → `event: character_response` 전송 + DB 저장
- 기존 클라이언트 이벤트 형식 유지 (하위 호환)

### R5. 프론트엔드 렌더링 적응
- ChatMessages.tsx: 기존 message 렌더링 로직 유지 (narrator/dialogue 분리)
- turns가 이미 개별 메시지로 저장되므로 프론트 변경 최소화
- 같은 캐릭터의 연속 대사도 개별 버블로 표시

### R6. 캐싱 호환성 유지
- systemInstruction에 모든 캐릭터 정보 포함 → implicit caching 유지
- contents(동적)에는 기존대로 세션/대화 컨텍스트
- 캐릭터 정보가 늘어나므로 토큰 예산 관리 필요

## 수정 대상 파일

| 파일 | 변경 내용 | 영향도 |
|------|-----------|--------|
| `src/lib/gemini.ts` | RESPONSE_SCHEMA → turns[], buildSystemInstruction 프롬프트 강화, generateStoryResponse 파싱 변경 | 핵심 |
| `src/app/api/chat/route.ts` | activeCharacters → allCharacters 전달, turns[] 순회 SSE 전송, DB 저장 로직 변경 | 핵심 |
| `src/lib/prompt-builder.ts` | formatConversationHistory에 turns 교차 형식 반영 | 보조 |
| `src/components/chat/ChatMessages.tsx` | 변경 불필요 (기존 narrator/dialogue 렌더링 그대로) | 없음 |

## 변경하지 않는 파일
- `useChatReducer.ts` — 메시지 타입(ChatMessage) 변경 없음
- `ChatContainer.tsx` — SSE 이벤트 핸들러 변경 없음 (narrator/character_response 그대로)
- `ChatCacheContext.tsx` — 캐시 구조 변경 없음
- `narrative-memory.ts` — 메모리 수집 로직 변경 없음
- Prisma schema — Message 모델 변경 없음

## 비변경 사항 (명시적 제외)
- DB 스키마 변경 없음 (Message 테이블 그대로)
- 프론트엔드 SSE 이벤트 타입 변경 없음
- 인증/세션 관리 변경 없음
- 이미지 생성 로직 변경 없음

## 성공 기준
1. 같은 입력("안녕", "죽어도 괜찮아")에 대해 5+ 블록의 교차 응답 생성
2. 2명 이상의 캐릭터가 상호작용하는 응답 생성
3. 나레이션이 캐릭터 행동/반응 중심 (환경 반복 아님)
4. 매 턴 새로운 정보/이벤트/긴장감 포함
5. 기존 SSE 스트리밍 + DB 저장 + 캐싱 정상 동작
6. npm run build 성공
7. Vercel 배포 후 실제 대화 테스트 통과

## 위험 요소
- **토큰 증가**: 모든 캐릭터 정보를 systemInstruction에 넣으면 토큰 사용량 증가 → maxOutputTokens 상향 필요 (2500 → 4000)
- **응답 시간**: turns가 많아지면 생성 시간 증가 → temperature/topP 조정으로 보상
- **캐싱 효율**: systemInstruction이 커지면 implicit caching 임계값(~32K 토큰) 주의
- **JSON 파싱**: turns[] 구조가 복잡해지면 파싱 실패 확률 증가 → 폴백 파서 강화 필요
