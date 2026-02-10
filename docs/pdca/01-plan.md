# PDCA Plan - SYNK 캐릭터 챗 시스템

## 프로젝트 현황 분석

### 현재 버전 상태
- **배포**: Vercel (https://synk-character-chat.vercel.app)
- **DB**: Neon PostgreSQL
- **커밋**: 4개 (Initial → PostgreSQL 마이그레이션 → Prisma 빌드 수정 → 보안 강화)

### 구현 완료 기능 (핵심)
1. OAuth 인증 (Kakao/Google)
2. 작품/캐릭터/오프닝/로어북 CRUD
3. Gemini 기반 멀티캐릭터 AI 채팅
4. Mem0 + 서사 메모리 이중 기억 시스템
5. 커뮤니티 (좋아요, 댓글, 팔로우, 알림)
6. 관리자 대시보드

### 발견된 문제 (이전 분석에서 수정 완료)
- [x] API 인증/인가 누락 → 전체 수정 완료
- [x] Prisma 싱글톤 프로덕션 캐싱 → 수정 완료
- [x] DB 복합 인덱스 부족 → 4개 추가
- [x] 메시지 길이 검증 없음 → 5000자 제한 추가
- [x] Error Boundary 없음 → 3개 추가
- [x] .env.example 불완전 → 전체 문서화

### 잔여 문제 & 개선 필요 사항
| 우선순위 | 항목 | 카테고리 |
|---------|------|---------|
| **P0** | Rate Limiting 없음 (API 남용 가능) | 보안 |
| **P0** | 홈페이지 2,731줄 모놀리식 컴포넌트 | 유지보수 |
| **P1** | 실시간 채팅 미지원 (동기 방식) | 성능/UX |
| **P1** | 이미지 업로드 로컬 스토리지 (Vercel 비호환) | 인프라 |
| **P1** | 기억 강도 감소 미구현 | 기능 |
| **P1** | 세션 요약 자동 생성 미구현 | 기능 |
| **P2** | PersonaManager/PersonaModal 코드 중복 | 코드 품질 |
| **P2** | Header.tsx 미사용 레거시 컴포넌트 | 코드 품질 |
| **P2** | 신고 관리 UI 없음 | 기능 |
| **P2** | SiteSetting API/UI 없음 | 기능 |
| **P3** | useCallback/useMemo 미사용 | 성능 |
| **P3** | Next.js Image 컴포넌트 미사용 | 성능 |
| **P3** | 접근성(a11y) 부족 | UX |

---

## 개선 목표 (스프린트 계획)

### Sprint 1: 안정화 & 성능 (1주)
- [ ] Rate Limiting 미들웨어 추가
- [ ] 이미지 업로드 클라우드 스토리지 전환 (Vercel Blob 또는 S3)
- [ ] 홈페이지 컴포넌트 분리 (page.tsx → 모듈화)
- [ ] 미사용 코드 제거 (Header.tsx)

### Sprint 2: 기능 완성 (1주)
- [ ] 채팅 스트리밍 응답 구현 (SSE)
- [ ] 기억 강도 감소 로직 구현
- [ ] 세션 요약 자동 생성
- [ ] 신고 관리 관리자 UI

### Sprint 3: UX & 최적화 (1주)
- [ ] 페르소나 컴포넌트 통합 (중복 제거)
- [ ] Next.js Image 컴포넌트 적용
- [ ] useCallback/useMemo 최적화
- [ ] 모바일 반응형 강화

---

## 리스크 분석

| 리스크 | 영향도 | 확률 | 대응 |
|--------|-------|------|------|
| Gemini API 비용 폭증 | 높음 | 중간 | Rate Limiting + 토큰 모니터링 |
| Mem0 메모리 무한 증가 | 중간 | 높음 | 기억 Pruning 전략 필요 |
| Vercel 로컬 파일 손실 | 높음 | 높음 | 클라우드 스토리지 전환 시급 |
| 동시 편집 충돌 | 낮음 | 낮음 | 향후 Optimistic Locking 검토 |
