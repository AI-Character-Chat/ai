/**
 * 커스텀 관계 진행 시스템 — 타입, 기본값, 유틸리티
 *
 * 창작자가 작품별로 관계 축(axes)과 레벨(levels)을 자유롭게 정의할 수 있도록
 * 하드코딩된 5축 시스템을 범용화.
 */

// ============================================================
// 타입 정의
// ============================================================

export interface RelationshipConfig {
  axes: AxisDefinition[];
  levels: LevelDefinition[];
  weights: Record<string, number>;
  defaultDeltas?: Record<string, number>;
  correlations?: CorrelationRule[];
}

export interface AxisDefinition {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  negative?: boolean;
}

export interface LevelDefinition {
  key: string;
  label: string;
  minScore: number;
  gates?: Record<string, number>;
  behaviorGuide?: string;
}

export interface CorrelationRule {
  ifAxis: string;
  ifOp: '>=' | '<=';
  ifValue: number;
  thenAxis: string;
  thenMinValue: number;
}

// ============================================================
// 기본 프리셋 (현재 5축 시스템)
// ============================================================

export const DEFAULT_RELATIONSHIP_CONFIG: RelationshipConfig = {
  axes: [
    { key: 'trust', label: '신뢰', description: '약속 이행/위반, 비밀 공유 시 변화', defaultValue: 50 },
    { key: 'affection', label: '호감', description: '따뜻한/차가운 대화 시 변화', defaultValue: 30 },
    { key: 'respect', label: '존경', description: '현명한 조언/무례한 행동 시 변화', defaultValue: 50 },
    { key: 'rivalry', label: '경쟁심', description: '도전적/양보적 발언 시 변화', defaultValue: 10, negative: true },
    { key: 'familiarity', label: '친숙도', description: '대화할 때마다 자연히 증가', defaultValue: 0 },
  ],
  levels: [
    { key: 'stranger', label: '처음 만난 사이', minScore: 0 },
    { key: 'acquaintance', label: '아는 사이', minScore: 20 },
    { key: 'friend', label: '친구', minScore: 40, gates: { familiarity: 15 } },
    {
      key: 'close_friend', label: '절친한 친구', minScore: 60,
      gates: { trust: 25, affection: 40, familiarity: 25 },
      behaviorGuide: '유저와 친밀한 관계. 비밀을 나눌 수 있고, 스킨십에 거부감 없음.',
    },
    {
      key: 'intimate', label: '특별한 사이', minScore: 80,
      gates: { trust: 40, affection: 60, familiarity: 40 },
      behaviorGuide: '유저에 대한 감정이 매우 깊음. 로맨틱한 상황에서 긍정적으로 반응. 고백을 받으면 수락할 가능성 높음.',
    },
  ],
  weights: {
    affection: 0.35,
    trust: 0.25,
    familiarity: 0.25,
    respect: 0.15,
    rivalry: -0.10,
  },
  defaultDeltas: {
    affection: 1,
    familiarity: 0.5,
  },
  correlations: [
    { ifAxis: 'affection', ifOp: '>=', ifValue: 70, thenAxis: 'trust', thenMinValue: 20 },
    { ifAxis: 'familiarity', ifOp: '>=', ifValue: 50, thenAxis: 'affection', thenMinValue: 10 },
    { ifAxis: 'trust', ifOp: '>=', ifValue: 70, thenAxis: 'familiarity', thenMinValue: 10 },
  ],
};

// 프리셋 템플릿
export const PRESET_TEMPLATES: Record<string, RelationshipConfig> = {
  rpg: {
    axes: [
      { key: 'combat', label: '무력', description: '전투 관련 행동/성과 시 변화', defaultValue: 10 },
      { key: 'intelligence', label: '지력', description: '지적 판단/전략적 사고 시 변화', defaultValue: 10 },
      { key: 'leadership', label: '통솔', description: '리더십/지휘 관련 행동 시 변화', defaultValue: 5 },
      { key: 'governance', label: '내정', description: '행정/관리 관련 활동 시 변화', defaultValue: 5 },
    ],
    levels: [
      { key: 'novice', label: '견습기사', minScore: 0 },
      { key: 'intermediate', label: '중급기사', minScore: 20, gates: { combat: 20 } },
      { key: 'captain', label: '기사단장', minScore: 40, gates: { combat: 40, leadership: 30 } },
      { key: 'general', label: '대장군', minScore: 60, gates: { combat: 60, leadership: 50, intelligence: 40 } },
      { key: 'king', label: '왕', minScore: 80, gates: { combat: 70, leadership: 60, intelligence: 50, governance: 50 } },
    ],
    weights: { combat: 0.30, intelligence: 0.25, leadership: 0.25, governance: 0.20 },
    defaultDeltas: {},
  },
  school: {
    axes: [
      { key: 'academics', label: '학업', description: '공부/시험/과제 관련 성과', defaultValue: 30 },
      { key: 'social', label: '사교', description: '대인관계/인맥 관련 활동', defaultValue: 20 },
      { key: 'athletics', label: '운동', description: '체육/스포츠 관련 활동', defaultValue: 10 },
      { key: 'creativity', label: '창의', description: '예술/창작 관련 활동', defaultValue: 10 },
    ],
    levels: [
      { key: 'freshman', label: '신입생', minScore: 0 },
      { key: 'regular', label: '일반 학생', minScore: 20 },
      { key: 'popular', label: '인기 학생', minScore: 40, gates: { social: 30 } },
      { key: 'star', label: '학교 스타', minScore: 60, gates: { social: 50 } },
      { key: 'president', label: '학생회장', minScore: 80, gates: { academics: 50, social: 60, creativity: 30 } },
    ],
    weights: { academics: 0.30, social: 0.30, athletics: 0.20, creativity: 0.20 },
    defaultDeltas: { social: 0.5 },
  },
};

// ============================================================
// 유틸리티 함수
// ============================================================

const DEFAULT_LEGACY_AXES = ['trust', 'affection', 'respect', 'rivalry', 'familiarity'];

/** Work.relationshipConfig JSON 파싱. 비어있거나 파싱 실패 시 DEFAULT 반환 */
export function resolveConfig(raw?: string | null): RelationshipConfig {
  if (!raw || raw === '{}' || raw === '') return DEFAULT_RELATIONSHIP_CONFIG;
  try {
    const parsed = JSON.parse(raw) as RelationshipConfig;
    if (!parsed.axes || !parsed.levels) return DEFAULT_RELATIONSHIP_CONFIG;
    return parsed;
  } catch {
    return DEFAULT_RELATIONSHIP_CONFIG;
  }
}

/** default 프리셋 여부 (기존 5축 DB 컬럼을 직접 사용할지 판단) */
export function isDefaultConfig(config: RelationshipConfig): boolean {
  if (config === DEFAULT_RELATIONSHIP_CONFIG) return true;
  const keys = config.axes.map(a => a.key).sort();
  return keys.length === 5 && keys.join(',') === DEFAULT_LEGACY_AXES.sort().join(',');
}

/** DB row에서 축 값 추출. default→기존 5컬럼, custom→customAxes JSON */
export function getAxisValues(
  relationship: Record<string, unknown>,
  config: RelationshipConfig,
): Record<string, number> {
  if (isDefaultConfig(config)) {
    return {
      trust: (relationship.trust as number) ?? 50,
      affection: (relationship.affection as number) ?? 30,
      respect: (relationship.respect as number) ?? 50,
      rivalry: (relationship.rivalry as number) ?? 10,
      familiarity: (relationship.familiarity as number) ?? 0,
    };
  }
  const custom: Record<string, number> = {};
  try {
    const parsed = JSON.parse((relationship.customAxes as string) || '{}') as Record<string, number>;
    for (const axis of config.axes) {
      custom[axis.key] = parsed[axis.key] ?? axis.defaultValue;
    }
  } catch {
    for (const axis of config.axes) {
      custom[axis.key] = axis.defaultValue;
    }
  }
  return custom;
}

/** 축 값 + 가중치 → intimacyScore (0~100) */
export function calculateScore(
  values: Record<string, number>,
  weights: Record<string, number>,
): number {
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (values[key] ?? 0) * weight;
  }
  return Math.max(0, Math.min(100, score));
}

/** 점수 + 게이트 → 현재 레벨 key (레벨은 높은 minScore부터 역순 탐색) */
export function calculateLevel(
  score: number,
  values: Record<string, number>,
  levels: LevelDefinition[],
): string {
  const sorted = [...levels].sort((a, b) => b.minScore - a.minScore);
  for (const level of sorted) {
    if (score < level.minScore) continue;
    if (!level.gates) return level.key;
    const gatesMet = Object.entries(level.gates).every(
      ([axisKey, minVal]) => (values[axisKey] ?? 0) >= minVal,
    );
    if (gatesMet) return level.key;
  }
  return levels[0]?.key || 'stranger';
}

/** 레벨 key → 한글 label */
export function translateLevel(key: string, levels: LevelDefinition[]): string {
  const found = levels.find(l => l.key === key);
  return found?.label || key;
}

/** 축 간 상관 보정 적용 (mutates values) */
export function applyCorrelations(
  values: Record<string, number>,
  correlations?: CorrelationRule[],
): Record<string, number> {
  if (!correlations) return values;
  for (const rule of correlations) {
    const current = values[rule.ifAxis] ?? 0;
    let conditionMet = false;
    if (rule.ifOp === '>=' && current >= rule.ifValue) conditionMet = true;
    if (rule.ifOp === '<=' && current <= rule.ifValue) conditionMet = true;
    if (conditionMet && (values[rule.thenAxis] ?? 0) < rule.thenMinValue) {
      values[rule.thenAxis] = rule.thenMinValue;
    }
  }
  return values;
}

/** 축 정의 → 초기 축 값 맵 */
export function getDefaultAxisValues(axes: AxisDefinition[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const axis of axes) {
    values[axis.key] = axis.defaultValue;
  }
  return values;
}

/** config 유효성 검증 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const c = config as RelationshipConfig;

  if (!c.axes || !Array.isArray(c.axes) || c.axes.length === 0) {
    errors.push('최소 1개의 축이 필요합니다.');
  } else if (c.axes.length > 10) {
    errors.push('축은 최대 10개까지 가능합니다.');
  } else {
    for (const axis of c.axes) {
      if (!axis.key || !axis.label) errors.push(`축 "${axis.key || '?'}"에 key와 label이 필요합니다.`);
      if (axis.defaultValue < 0 || axis.defaultValue > 100) errors.push(`축 "${axis.key}"의 초기값은 0~100이어야 합니다.`);
    }
    const keys = c.axes.map(a => a.key);
    if (new Set(keys).size !== keys.length) errors.push('축 key가 중복됩니다.');
  }

  if (!c.levels || !Array.isArray(c.levels) || c.levels.length < 2) {
    errors.push('최소 2개의 레벨이 필요합니다.');
  } else if (c.levels.length > 10) {
    errors.push('레벨은 최대 10개까지 가능합니다.');
  }

  if (!c.weights || typeof c.weights !== 'object') {
    errors.push('가중치(weights)가 필요합니다.');
  }

  return { valid: errors.length === 0, errors };
}

/** 축 값 → 프롬프트용 특성 태그 동적 생성 */
export function generateTraits(
  values: Record<string, number>,
  config: RelationshipConfig,
): string[] {
  const traits: string[] = [];
  for (const axis of config.axes) {
    const v = values[axis.key] ?? 0;
    if (axis.negative) {
      if (v >= 50) traits.push(`${axis.label} 높음`);
    } else {
      if (v >= 70) traits.push(`${axis.label} 높음`);
      else if (v <= 30) traits.push(`${axis.label} 낮음`);
    }
  }
  return traits;
}

/** 현재 레벨의 행동 가이드 반환 */
export function getBehaviorGuide(
  levelKey: string,
  values: Record<string, number>,
  config: RelationshipConfig,
): string[] {
  const guides: string[] = [];

  // 레벨 자체 가이드
  const level = config.levels.find(l => l.key === levelKey);
  if (level?.behaviorGuide) {
    guides.push(level.behaviorGuide);
  }

  // 축별 동적 가이드 (높은 축/낮은 축 조합)
  for (const axis of config.axes) {
    const v = values[axis.key] ?? 0;
    if (!axis.negative && v >= 85) {
      guides.push(`${axis.label}이(가) 매우 높음. 관련 상황에서 매우 긍정적으로 반응.`);
    } else if (!axis.negative && v <= 15) {
      guides.push(`${axis.label}이(가) 매우 낮음. 관련 상황에서 부정적이거나 방어적으로 반응.`);
    }
  }

  return guides;
}

/** Pro 분석 프롬프트용 축 설명 텍스트 동적 생성 */
export function generateProAxisDescriptions(config: RelationshipConfig): string {
  return config.axes.map(a =>
    `- ${a.key}(${a.label}): ${a.description}`,
  ).join('\n');
}

/** Pro 분석 프롬프트용 JSON 예시 동적 생성 */
export function generateProDeltaExample(config: RelationshipConfig): string {
  const example: Record<string, number> = {};
  config.axes.forEach(a => { example[a.key] = 0; });
  return JSON.stringify({ relationshipDeltas: { '캐릭터이름': example } });
}

/** Pro 분석 프롬프트용 정합성 규칙 텍스트 */
export function generateProCorrelationRules(config: RelationshipConfig): string {
  if (!config.correlations || config.correlations.length === 0) return '';
  const lines = config.correlations.map(r => {
    const ifAxis = config.axes.find(a => a.key === r.ifAxis);
    const thenAxis = config.axes.find(a => a.key === r.thenAxis);
    const op = r.ifOp === '>=' ? '높아질 때' : '낮아질 때';
    return `- ${ifAxis?.label || r.ifAxis}이(가) ${op} → ${thenAxis?.label || r.thenAxis}도 함께 변화`;
  });
  return `\n## 축 간 정합성 규칙 (반드시 준수):\n${lines.join('\n')}`;
}
