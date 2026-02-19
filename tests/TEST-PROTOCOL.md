# Memory System Test Protocol

## 표준 테스트 프로토콜

### 기본 원칙
1. **항상 clean start**: `--keep-memory=false` (기억 초기화 후 시작)
2. **2회 실행, 중앙값 채택**: Gemini Flash 비결정성 보정
3. **한 번에 하나만 변경**: 코드 변경과 결과를 1:1 매핑

### 2단계 검증 프로세스

#### Stage 1: 빠른 검증 (Quick Validation)
- **시나리오**: `--scenario=default` (60턴, 30 facts, 58 checks)
- **소요시간**: ~10분/회, 총 ~20분 (2회)
- **용도**: 코드 변경 직후 효과 확인
- **통과 기준**: 기준선 대비 +3pp 이상 (1회라도 기준선 이하이면 재검토)

#### Stage 2: 최종 확인 (Full Validation)
- **시나리오**: `--scenario=v5` (150턴, 30 facts, 156 checks)
- **소요시간**: ~30분/회, 총 ~60분 (2회)
- **용도**: Stage 1 통과 후 최종 검증
- **통과 기준**: 기준선 대비 +2pp 이상 (중앙값)

### 실행 명령어

```bash
# Stage 1: 60턴 빠른 검증
npx tsx scripts/test-memory-simulation.ts \
  --scenario=default \
  --turns=60 \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=<TOKEN>" \
  --keep-memory=false \
  --delay=3000

# Stage 2: 150턴 최종 확인
npx tsx scripts/test-memory-simulation.ts \
  --scenario=v5 \
  --turns=150 \
  --base-url=https://synk-character-chat.vercel.app \
  --cookie="__Secure-authjs.session-token=<TOKEN>" \
  --keep-memory=false \
  --delay=3000
```

### 쿠키 획득 방법
1. https://synk-character-chat.vercel.app 로그인
2. 개발자 도구(F12) → Application → Cookies
3. `__Secure-authjs.session-token` 값 복사

## 기록 체계

### 1. JSON 원본 (`tests/results/`)
```
tests/results/
  v8-baseline.json          # 기준선
  v8-surprise-filter.json   # 변경별 결과
  v9-xxx.json               # 다음 버전
```

### 2. CSV 요약 (`scripts/memory-test-tracker.csv`)
- 전체 테스트 이력 한눈에 보기
- 버전별 통과율/save/reinforce/skip 비교

### 3. 대시보드 (`scripts/memory-test-dashboard.html`)
- 시각적 차트/테이블

### JSON 결과 포맷
```json
{
  "version": "v8",
  "name": "surprise-filter-relaxation",
  "date": "2026-02-19",
  "description": "Surprise 필터 임계값 완화 (0.85/0.6 → 0.90/0.75)",
  "changes": [
    "reinforce >= 0.85 → >= 0.90",
    "skip 0.6~0.85 → 0.75~0.90",
    "skip 조건 imp<0.7 → imp<0.4",
    "save < 0.6 → < 0.75"
  ],
  "files_changed": ["src/lib/narrative-memory.ts"],
  "baseline": {
    "code": "이전 (0.85/0.6)",
    "scenario": "default-60",
    "keep_memory": false,
    "runs": [
      { "pass_rate": 74.1, "passed": 43, "total": 58, "save": 41, "reinforce": 6, "skip": 0, "avg_response_ms": 8731 }
    ]
  },
  "results": {
    "scenario": "default-60",
    "keep_memory": false,
    "runs": [
      { "run": 1, "pass_rate": 79.3, "passed": 46, "total": 58, "save": 40, "reinforce": 1, "skip": 2, "avg_response_ms": 8947 },
      { "run": 2, "pass_rate": 81.0, "passed": 47, "total": 58, "save": 42, "reinforce": 1, "skip": 3, "avg_response_ms": 8658 }
    ],
    "median_pass_rate": 80.2,
    "improvement_pp": 6.1
  },
  "conclusion": "confirmed",
  "notes": "2회 모두 기준선 초과. 중앙값 80.2%로 +6.1pp 개선 확인."
}
```

## 현재 기준선 (Baselines)

| 시나리오 | 코드 | 통과율 | 날짜 |
|---------|------|--------|------|
| default-60 | v8 이전 (0.85/0.6) | 74.1% (43/58) | 2026-02-19 |
| default-60 | v8 현재 (0.90/0.75) | 80.2% (중앙값) | 2026-02-19 |
| v5-150 | v8 이전 (0.85/0.6) | 45.5% (71/156) | 2026-02-20 |
| v5-150 | v8 현재 (0.90/0.75) | 71.2% (중앙값) | 2026-02-20 |

> 새 코드 변경 시 v8 현재가 새로운 기준선이 됨: 60턴 80.2%, 150턴 71.2%.

## 버전 넘버링 규칙
- **Major (v5, v6, v7...)**: 아키텍처 변경 (영구기억, Pro 디렉팅 등)
- **Minor (v8-xxx)**: 파라미터/임계값 변경 (surprise filter 등)
- 테스트 ID: `{version}-{change-name}-run{N}` (예: `v8-surprise-filter-run1`)
