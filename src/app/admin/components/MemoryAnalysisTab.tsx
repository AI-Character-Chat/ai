'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// 타입
// ============================================================

interface SessionItem {
  id: string;
  workTitle: string;
  userName: string;
  userId: string | null;
  turnCount: number;
  messageCount: number;
  memoriesCount: number;
  createdAt: string;
}

interface MessageItem {
  id: string;
  content: string;
  characterId: string | null;
  characterName: string | null;
  messageType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface MemoryItem {
  id: string;
  characterId: string;
  characterName: string | null;
  originalEvent: string;
  interpretation: string;
  importance: number;
  strength: number;
  memoryType: string;
  keywords: string[];
  mentionedCount: number;
  createdAt: string;
}

interface RelationshipItem {
  id: string;
  characterId: string;
  characterName: string | null;
  trust: number;
  affection: number;
  respect: number;
  rivalry: number;
  familiarity: number;
  intimacyLevel: string;
  intimacyScore: number;
  knownFacts: string[];
  sharedExperiences: string[];
  emotionalHistory: Array<{ emotion: string; intensity: number; at: string }>;
  totalTurns: number;
  speechStyle: string;
  nicknameForUser: string | null;
}

interface SessionDetail {
  session: {
    id: string;
    workTitle: string;
    userName: string;
    turnCount: number;
    characters: Array<{ id: string; name: string }>;
    createdAt: string;
  };
  messages: MessageItem[];
  memories: MemoryItem[];
  relationships: RelationshipItem[];
}

type SubTab = 'messages' | 'memories' | 'relationships';

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function MemoryAnalysisTab() {
  // 세션 목록
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 세션 상세
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 서브탭
  const [subTab, setSubTab] = useState<SubTab>('messages');

  // 메시지 확장
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  // 세션 목록 로드
  const loadSessions = useCallback(async (p: number, search: string) => {
    setSessionsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/memory/sessions?${params}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSessions(data.sessions);
      setTotalPages(data.totalPages);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(page, searchQuery);
  }, [page, searchQuery, loadSessions]);

  // 세션 상세 로드
  const loadDetail = useCallback(async (sessionId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/memory/session/${sessionId}`);
      if (!res.ok) throw new Error('Failed');
      const data: SessionDetail = await res.json();
      setDetail(data);
    } catch (e) {
      console.error('Failed to load session detail:', e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSubTab('messages');
    setExpandedMessageId(null);
    loadDetail(sessionId);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadSessions(1, searchQuery);
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)]">
      {/* 좌측: 세션 목록 */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="작품명 검색..."
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400"
            />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="p-4 text-center text-gray-400 text-sm">로딩 중...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">세션 없음</div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  selectedSessionId === s.id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                  {s.workTitle}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {s.userName} · {s.turnCount}턴 · 기억 {s.memoriesCount}개
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                </div>
              </button>
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 disabled:opacity-30"
            >
              이전
            </button>
            <span className="text-gray-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 disabled:opacity-30"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 우측: 세션 상세 */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {!selectedSessionId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            왼쪽에서 세션을 선택하세요
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            로딩 중...
          </div>
        ) : detail ? (
          <>
            {/* 세션 헤더 */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{detail.session.workTitle}</h3>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {detail.session.userName} · {detail.session.turnCount}턴 ·
                    캐릭터: {detail.session.characters.map(c => c.name).join(', ')}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                    기억 {detail.memories.length}
                  </span>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                    관계 {detail.relationships.length}
                  </span>
                </div>
              </div>

              {/* 서브탭 */}
              <div className="flex gap-1 mt-3">
                {([
                  ['messages', '대화'],
                  ['memories', '기억'],
                  ['relationships', '관계'],
                ] as [SubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSubTab(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      subTab === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 서브탭 컨텐츠 */}
            <div className="flex-1 overflow-y-auto p-3">
              {subTab === 'messages' && (
                <MessagesView
                  messages={detail.messages}
                  expandedId={expandedMessageId}
                  onToggle={id => setExpandedMessageId(prev => prev === id ? null : id)}
                />
              )}
              {subTab === 'memories' && (
                <MemoriesView memories={detail.memories} />
              )}
              {subTab === 'relationships' && (
                <RelationshipsView relationships={detail.relationships} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// 서브탭 1: 대화 뷰
// ============================================================

function MessagesView({
  messages,
  expandedId,
  onToggle,
}: {
  messages: MessageItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (messages.length === 0) {
    return <div className="text-center text-gray-400 text-sm py-8">메시지 없음</div>;
  }

  // 연속된 AI 메시지를 턴 단위로 그룹핑
  const groups: Array<{ userMsg?: MessageItem; aiMsgs: MessageItem[] }> = [];
  let currentGroup: { userMsg?: MessageItem; aiMsgs: MessageItem[] } | null = null;

  for (const msg of messages) {
    if (msg.messageType === 'user') {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { userMsg: msg, aiMsgs: [] };
    } else if (msg.messageType === 'system') {
      // system 메시지 스킵
      continue;
    } else {
      if (!currentGroup) currentGroup = { aiMsgs: [] };
      currentGroup.aiMsgs.push(msg);
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return (
    <div className="space-y-3">
      {groups.map((group, i) => {
        const metadata = group.aiMsgs.length > 0
          ? group.aiMsgs[group.aiMsgs.length - 1].metadata
          : null;
        const extractedFactsCount = (metadata as Record<string, unknown>)?.extractedFactsCount as number | undefined;
        const memoryDebug = (metadata as Record<string, unknown>)?.memoryDebug as Array<Record<string, unknown>> | undefined;
        const memoryUpdateResults = (metadata as Record<string, unknown>)?.memoryUpdateResults as Array<Record<string, unknown>> | undefined;
        const isExpanded = group.userMsg ? expandedId === group.userMsg.id : expandedId === `group-${i}`;
        const groupId = group.userMsg?.id || `group-${i}`;

        // extractedFactsCount === 0이면 추출 실패 후보
        const isExtractionFailed = group.userMsg && extractedFactsCount === 0;

        return (
          <div
            key={groupId}
            className={`rounded-lg border transition-colors cursor-pointer ${
              isExtractionFailed
                ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/10'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            onClick={() => onToggle(groupId)}
          >
            {/* 유저 메시지 */}
            {group.userMsg && (
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0">USER</span>
                  <p className={`text-sm text-gray-900 dark:text-white ${!isExpanded ? 'line-clamp-2' : ''}`}>
                    {group.userMsg.content}
                  </p>
                </div>
                {/* 배지 */}
                <div className="flex gap-2 mt-1.5 ml-10">
                  {extractedFactsCount !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      extractedFactsCount > 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>
                      추출 {extractedFactsCount}
                    </span>
                  )}
                  {memoryUpdateResults && memoryUpdateResults.map((r, j) => {
                    const action = r.surpriseAction as string;
                    const colorMap: Record<string, string> = {
                      save: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                      reinforce: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                      skip: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                    };
                    return (
                      <span key={j} className={`text-xs px-1.5 py-0.5 rounded ${colorMap[action] || 'bg-gray-100 text-gray-500'}`}>
                        {action?.toUpperCase()} {r.surpriseScore !== undefined ? `(${(r.surpriseScore as number).toFixed(2)})` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI 응답 요약 */}
            {group.aiMsgs.length > 0 && (
              <div className={`px-3 pb-2 ${group.userMsg ? 'pt-0' : 'pt-3'}`}>
                {group.aiMsgs.map(aiMsg => (
                  <div key={aiMsg.id} className="flex items-start gap-2 mt-1">
                    <span className={`text-xs font-medium mt-0.5 flex-shrink-0 ${
                      aiMsg.messageType === 'narrator'
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-orange-600 dark:text-orange-400'
                    }`}>
                      {aiMsg.messageType === 'narrator' ? 'NAR' : aiMsg.characterName || 'AI'}
                    </span>
                    <p className={`text-sm text-gray-600 dark:text-gray-300 ${!isExpanded ? 'line-clamp-1' : ''}`}>
                      {aiMsg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 확장: memoryDebug 상세 */}
            {isExpanded && memoryDebug && memoryDebug.length > 0 && (
              <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 mt-1 pt-2">
                <div className="text-xs font-medium text-gray-500 mb-1.5">Memory Debug</div>
                {memoryDebug.map((debug, j) => {
                  const rel = debug.relationship as Record<string, unknown> | undefined;
                  return (
                    <div key={j} className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 mb-1.5">
                      <div className="font-medium text-gray-700 dark:text-gray-300">
                        {debug.characterName as string}
                      </div>
                      {rel && (
                        <div className="flex gap-2 mt-1 text-gray-500">
                          <span>신뢰 {rel.trust as number}</span>
                          <span>호감 {rel.affection as number}</span>
                          <span>존경 {rel.respect as number}</span>
                          <span>경쟁 {rel.rivalry as number}</span>
                          <span>친숙 {rel.familiarity as number}</span>
                        </div>
                      )}
                      <div className="text-gray-400 mt-0.5">
                        기억 {debug.recentMemoriesCount as number}개 · knownFacts {(debug.knownFacts as string[])?.length || 0}개
                      </div>
                      {/* knownFacts 목록 */}
                      {isExpanded && (debug.knownFacts as string[])?.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {(debug.knownFacts as string[]).map((fact, k) => (
                            <div key={k} className="text-gray-500 dark:text-gray-400 pl-2 border-l border-gray-300 dark:border-gray-600">
                              {fact}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 확장: extractedFacts 상세 (향후 데이터) */}
            {isExpanded && metadata && Array.isArray((metadata as Record<string, unknown>).extractedFacts) && (
              <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
                <div className="text-xs font-medium text-gray-500 mb-1">추출된 팩트</div>
                {((metadata as Record<string, unknown>).extractedFacts as string[]).map((fact, j) => (
                  <div key={j} className="text-xs text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-green-400 mb-0.5">
                    {fact}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 서브탭 2: 기억 뷰
// ============================================================

function MemoriesView({ memories }: { memories: MemoryItem[] }) {
  const [sortBy, setSortBy] = useState<'importance' | 'createdAt'>('createdAt');

  if (memories.length === 0) {
    return <div className="text-center text-gray-400 text-sm py-8">저장된 기억 없음</div>;
  }

  // 캐릭터별 그룹핑
  const byCharacter = new Map<string, MemoryItem[]>();
  for (const m of memories) {
    const key = m.characterName || m.characterId;
    if (!byCharacter.has(key)) byCharacter.set(key, []);
    byCharacter.get(key)!.push(m);
  }

  // 정렬
  Array.from(byCharacter.values()).forEach(items => {
    items.sort((a, b) =>
      sortBy === 'importance'
        ? b.importance - a.importance
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  const typeColors: Record<string, string> = {
    episodic: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    semantic: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    emotional: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  };

  return (
    <div>
      {/* 정렬 토글 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSortBy('createdAt')}
          className={`text-xs px-2 py-1 rounded ${sortBy === 'createdAt' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
        >
          최신순
        </button>
        <button
          onClick={() => setSortBy('importance')}
          className={`text-xs px-2 py-1 rounded ${sortBy === 'importance' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
        >
          중요도순
        </button>
        <span className="text-xs text-gray-400 ml-auto">총 {memories.length}개</span>
      </div>

      {Array.from(byCharacter.entries()).map(([charName, items]) => (
        <div key={charName} className="mb-4">
          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
            {charName} ({items.length})
          </h4>
          <div className="space-y-2">
            {items.map(m => (
              <div key={m.id} className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColors[m.memoryType] || 'bg-gray-100 text-gray-500'}`}>
                    {m.memoryType}
                  </span>
                  <span className="text-gray-400">중요도 {(m.importance * 100).toFixed(0)}%</span>
                  <span className="text-gray-400">강도 {(m.strength * 100).toFixed(0)}%</span>
                  {m.mentionedCount > 0 && (
                    <span className="text-gray-400">언급 {m.mentionedCount}회</span>
                  )}
                </div>
                <div className="text-gray-700 dark:text-gray-300 mb-0.5">{m.originalEvent}</div>
                <div className="text-gray-500 dark:text-gray-400 italic">{m.interpretation}</div>
                {m.keywords.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {m.keywords.map((kw, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-[10px]">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 서브탭 3: 관계 뷰
// ============================================================

function RelationshipsView({ relationships }: { relationships: RelationshipItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (relationships.length === 0) {
    return <div className="text-center text-gray-400 text-sm py-8">관계 데이터 없음</div>;
  }

  const axes = [
    { key: 'trust', label: '신뢰', color: 'bg-blue-500' },
    { key: 'affection', label: '호감', color: 'bg-pink-500' },
    { key: 'respect', label: '존경', color: 'bg-purple-500' },
    { key: 'rivalry', label: '경쟁', color: 'bg-red-500' },
    { key: 'familiarity', label: '친숙', color: 'bg-green-500' },
  ] as const;

  const intimacyLabels: Record<string, string> = {
    stranger: '낯선 사이',
    acquaintance: '아는 사이',
    friend: '친구',
    close_friend: '절친',
    intimate: '특별한 사이',
  };

  return (
    <div className="space-y-2">
      {relationships.map(r => {
        const isExpanded = expandedId === r.id;
        return (
          <div key={r.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* 캐릭터 헤더 (클릭으로 토글) */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : r.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-gray-900 dark:text-white">{r.characterName || r.characterId}</h4>
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  {intimacyLabels[r.intimacyLevel] || r.intimacyLevel}
                </span>
                {r.nicknameForUser && (
                  <span className="text-xs text-gray-500">호칭: {r.nicknameForUser}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* 축약 5축 수치 */}
                <div className="hidden sm:flex gap-1.5 text-[10px] text-gray-400">
                  <span>신뢰{r.trust.toFixed(0)}</span>
                  <span>호감{r.affection.toFixed(0)}</span>
                  <span>존경{r.respect.toFixed(0)}</span>
                  <span>친숙{r.familiarity.toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{r.totalTurns}턴</span>
                  <span>사실 {r.knownFacts.length}</span>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* 확장 디테일 */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-3 space-y-4">
                {/* 5축 바 */}
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">관계 5축</div>
                  <div className="space-y-1.5">
                    {axes.map(axis => (
                      <div key={axis.key} className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-gray-500 text-right">{axis.label}</span>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                          <div
                            className={`${axis.color} h-2.5 rounded-full transition-all`}
                            style={{ width: `${r[axis.key]}%` }}
                          />
                        </div>
                        <span className="w-10 text-gray-600 dark:text-gray-300 font-medium">{r[axis.key].toFixed(0)}/100</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* knownFacts */}
                {r.knownFacts.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      알고 있는 사실 ({r.knownFacts.length})
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {r.knownFacts.map((fact, i) => (
                        <div key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-2.5 border-l-2 border-green-400 py-0.5">
                          {fact}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* sharedExperiences */}
                {r.sharedExperiences.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      공유 경험 ({r.sharedExperiences.length})
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {r.sharedExperiences.map((exp, i) => (
                        <div key={i} className="text-xs text-gray-600 dark:text-gray-400 pl-2.5 border-l-2 border-blue-400 py-0.5">
                          {typeof exp === 'string' ? exp : JSON.stringify(exp)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* emotionalHistory */}
                {r.emotionalHistory.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      감정 기록 (최근 {Math.min(r.emotionalHistory.length, 10)}개)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.emotionalHistory.slice(-10).map((eh, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded">
                          {eh.emotion} ({(eh.intensity * 100).toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 기타 정보 */}
                <div className="flex gap-4 text-xs text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span>친밀도 점수: {r.intimacyScore.toFixed(1)}</span>
                  <span>말투: {r.speechStyle === 'formal' ? '존댓말' : r.speechStyle === 'casual' ? '반말' : r.speechStyle === 'intimate' ? '친밀체' : r.speechStyle}</span>
                  <span>총 대화: {r.totalTurns}턴</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
