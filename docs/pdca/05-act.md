# PDCA Act - 개선 실행 계획

## 즉시 실행 (P0 - 이번 주)

### 1. Rate Limiting 미들웨어 추가
```
영향: 전체 API
구현: Next.js middleware.ts + IP/유저 기반 제한
대상:
  - /api/chat PUT: 분당 10회
  - /api/generate-image: 분당 5회
  - /api/upload: 분당 10회
  - 기타 쓰기 API: 분당 30회
```

### 2. 이미지 업로드 클라우드 전환
```
영향: /api/upload, 프론트엔드 이미지 표시
현재: public/uploads/ (로컬 파일시스템)
목표: Vercel Blob Storage 또는 AWS S3
이유: Vercel 서버리스는 비영구 파일시스템
```

---

## 단기 실행 (P1 - 2주 내)

### 3. 채팅 스트리밍 응답 (SSE)
```
영향: /api/chat PUT, chat/[workId]/page.tsx
현재: 동기 방식 (응답 완료까지 2-5초 대기)
목표: Server-Sent Events로 점진적 응답
효과: 체감 응답 시간 대폭 단축
```

### 4. 기억 강도 감소 로직
```
영향: narrative-memory.ts, CharacterMemory
현재: strength 필드 존재하나 항상 1.0
목표: 시간 경과에 따른 기억 강도 자연 감소
방식: 장면 전환 시 또는 주기적 배치로 strength * 0.95
```

### 5. 세션 요약 자동 생성
```
영향: /api/chat PUT, ChatSession.sessionSummary
현재: sessionSummary 필드 항상 빈 문자열
목표: 20턴마다 Gemini로 대화 요약 생성
효과: 긴 대화에서 컨텍스트 유지 개선
```

### 6. 홈페이지 컴포넌트 분리
```
영향: page.tsx (2731줄)
현재: useState 50개+, 모든 기능 단일 파일
목표:
  src/app/page.tsx → 레이아웃만
  src/components/home/
    ├── WorkGrid.tsx        (작품 그리드)
    ├── WorkCard.tsx         (작품 카드)
    ├── WorkDetail.tsx       (작품 상세 모달)
    ├── BannerCarousel.tsx   (배너 슬라이더)
    ├── CommentSection.tsx   (댓글 영역)
    ├── ProfileEditor.tsx    (프로필 편집)
    └── SearchResults.tsx    (검색 결과)
```

---

## 중기 실행 (P2 - 1개월 내)

### 7. 페르소나 컴포넌트 통합
```
PersonaManager.tsx + PersonaModal.tsx → PersonaSystem.tsx
공통 로직을 커스텀 훅 usePersona()로 추출
```

### 8. 미사용 코드 정리
```
- Header.tsx 삭제 (MainHeader로 대체됨)
- 남은 console.log 정리
```

### 9. 신고 관리 관리자 UI
```
/admin 페이지에 "신고 관리" 탭 추가
- 신고 목록 조회 (상태별 필터)
- 신고 상세 확인 (대상 콘텐츠 포함)
- 상태 변경 (pending → reviewing → resolved/rejected)
- 관리자 메모 작성
```

### 10. SiteSetting API
```
GET/PUT /api/admin/settings
- 사이트 이름, 설명
- 회원가입 허용 여부
- 성인 콘텐츠 허용 여부
- 기본 테마
```

---

## 장기 실행 (P3 - 분기 내)

### 11. 프론트엔드 성능 최적화
- useCallback/useMemo 적용
- Next.js Image 컴포넌트 전환
- React.memo 적용
- 채팅 메시지 가상화 (virtualization)

### 12. 접근성 강화
- aria-label 추가
- role 속성 추가
- 키보드 네비게이션

### 13. 테스트 인프라
- API 라우트 통합 테스트
- 채팅 플로우 E2E 테스트
- 인증 플로우 테스트

### 14. 모니터링
- Sentry 에러 추적
- Vercel Analytics
- API 응답 시간 모니터링

---

## PDCA 사이클 요약

| 단계 | 상태 | 내용 |
|------|------|------|
| **Plan** | ✅ 완료 | 현황 분석, 문제점 식별, 스프린트 계획 수립 |
| **Design** | ✅ 완료 | 시스템 아키텍처, 데이터 플로우, 기술 스택 문서화 |
| **Do** | 🔄 진행중 | 핵심 기능 구현 완료, 보안 강화 완료, P0 잔여 |
| **Check** | ✅ 완료 | 갭 분석, 69/100점 평가, 치명적 이슈 식별 |
| **Act** | 📋 계획됨 | P0~P3 우선순위별 14개 개선 과제 도출 |

### 다음 PDCA 사이클 트리거
- P0 항목 완료 후 → Check 재수행
- Sprint 1 완료 후 → 전체 재평가
