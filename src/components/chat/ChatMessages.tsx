'use client';

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import type { ChatWork, ChatMessage, ChatCharacter, ResponseMetadata, ProAnalysisMetrics, CharacterMemoryDebugData, MemoryUpdateResult } from './useChatReducer';

interface ChatMessagesProps {
  messages: ChatMessage[];
  work: ChatWork;
  sending: boolean;
  generatingImages: Set<string>;
  responseMetadata: Record<string, ResponseMetadata>;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onScroll: () => void;
  showScrollButton: boolean;
  onScrollToBottom: () => void;
  isAdmin?: boolean;
}

function getCharacterColor(characterId: string | null, characters: ChatCharacter[]) {
  if (!characterId) return 'bg-gray-200 dark:bg-gray-700';
  const index = characters.findIndex(c => c.id === characterId);
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'];
  return colors[index % colors.length];
}

function formatMessage(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <span key={index} className="italic text-gray-500 dark:text-gray-400">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// Gemini API 공식 가격 (2025, Standard Tier, ≤200k)
// https://ai.google.dev/gemini-api/docs/pricing
const PRICING = {
  flash: { input: 0.30, cached: 0.03, output: 2.50 },   // $/1M tokens
  pro:   { input: 1.25, output: 10.00 },                  // $/1M tokens (output includes thinking)
};

function calcFlashCost(m: ResponseMetadata) {
  const cached = m.cachedTokens ?? 0;
  const nonCached = (m.promptTokens ?? 0) - cached;
  const inputCost = (nonCached * PRICING.flash.input + cached * PRICING.flash.cached) / 1_000_000;
  const outputCost = ((m.outputTokens ?? 0) + (m.thinkingTokens ?? 0)) * PRICING.flash.output / 1_000_000;
  return inputCost + outputCost;
}

function calcProCost(pm: ProAnalysisMetrics) {
  const inputCost = (pm.promptTokens ?? 0) * PRICING.pro.input / 1_000_000;
  const outputCost = ((pm.outputTokens ?? 0) + (pm.thinkingTokens ?? 0)) * PRICING.pro.output / 1_000_000;
  return inputCost + outputCost;
}

function formatCost(usd: number) {
  const krw = usd * 1460;
  if (usd < 0.001) return `$${usd.toFixed(5)} (₩${krw.toFixed(2)})`;
  return `$${usd.toFixed(4)} (₩${krw.toFixed(1)})`;
}

function MetadataPopup({ metadata, onClose }: { metadata: ResponseMetadata; onClose: () => void }) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();
  const flashCost = calcFlashCost(metadata);
  const proCost = metadata.proAnalysisMetrics?.status === 'complete' ? calcProCost(metadata.proAnalysisMetrics) : 0;
  const totalCost = flashCost + proCost;

  return (
    <div
      ref={popupRef}
      className="absolute bottom-8 right-0 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 text-sm"
    >
      <div className="font-semibold text-gray-900 dark:text-white mb-2">AI 응답 정보</div>
      <div className="space-y-2 text-gray-600 dark:text-gray-400">
        {/* 모델 */}
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <div className="flex justify-between">
            <span>모델</span>
            <span className="text-gray-900 dark:text-white font-medium">{metadata.model}</span>
          </div>
          <div className="flex justify-between">
            <span>Thinking</span>
            <span className="text-gray-900 dark:text-white font-medium">
              {metadata.thinking ? `ON (${fmt(metadata.thinkingTokens)} 토큰)` : 'OFF'}
            </span>
          </div>
        </div>

        {/* 토큰 */}
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <div className="flex justify-between">
            <span>프롬프트</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.promptTokens)} 토큰</span>
          </div>
          <div className="flex justify-between text-xs ml-2">
            <span>캐시 히트</span>
            <span className="text-green-600 dark:text-green-400">{fmt(metadata.cachedTokens)} ({metadata.cacheHitRate}%)</span>
          </div>
          <div className="flex justify-between">
            <span>응답</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.outputTokens)} 토큰</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>총 토큰</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.totalTokens)}</span>
          </div>
        </div>

        {/* 시간 */}
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <div className="flex justify-between">
            <span>기억 조회</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.narrativeMemoryMs)}ms</span>
          </div>
          <div className="flex justify-between">
            <span>프롬프트 빌드</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.promptBuildMs)}ms</span>
          </div>
          <div className="flex justify-between">
            <span>Gemini API</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.geminiApiMs)}ms</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>총 응답 시간</span>
            <span className="text-gray-900 dark:text-white">{fmt(metadata.totalMs)}ms</span>
          </div>
        </div>

        {/* Pro 디렉터 노트 포함 여부 */}
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <div className="flex justify-between">
            <span>Pro 디렉터 노트</span>
            {metadata.proAnalysis ? (
              <span className="text-green-600 dark:text-green-400 font-medium">포함 ({metadata.proAnalysis.length}자)</span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">미포함 (첫 턴)</span>
            )}
          </div>
        </div>

        {/* 비용 */}
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <div className="flex justify-between">
            <span>Flash 비용</span>
            <span className="text-gray-900 dark:text-white">{formatCost(flashCost)}</span>
          </div>
          {proCost > 0 && (
            <div className="flex justify-between">
              <span>Pro 분석 비용</span>
              <span className="text-purple-600 dark:text-purple-400">{formatCost(proCost)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium">
            <span>턴 총 비용</span>
            <span className="text-orange-600 dark:text-orange-400">{formatCost(totalCost)}</span>
          </div>
        </div>

        {/* 감정 & 컨텍스트 (새 기능) */}
        {(metadata.emotions || metadata.lorebookActivated !== undefined) && (
          <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
            {metadata.emotions && metadata.emotions.length > 0 && (
              <div>
                <span className="text-xs font-medium text-purple-500">감정 분석</span>
                {metadata.emotions.map((e: string, i: number) => (
                  <div key={i} className="text-xs text-gray-500 dark:text-gray-400 ml-1">{e}</div>
                ))}
              </div>
            )}
            {metadata.lorebookActivated !== undefined && (
              <div className="flex justify-between mt-1">
                <span>로어북 활성화</span>
                <span className="text-gray-900 dark:text-white font-medium">{metadata.lorebookActivated}개</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>선별적 히스토리</span>
              <span className={`font-medium ${metadata.selectiveHistory ? 'text-green-500' : 'text-gray-400'}`}>
                {metadata.selectiveHistory ? `ON (${metadata.relevantHistoryCount}개)` : 'OFF'}
              </span>
            </div>
            {metadata.turnNumber && (
              <div className="flex justify-between">
                <span>턴 번호</span>
                <span className="text-gray-900 dark:text-white">{metadata.turnNumber}</span>
              </div>
            )}
          </div>
        )}

        {/* 기타 */}
        <div className="flex justify-between">
          <span>turns: {metadata.turnsCount}개</span>
          <span>완료: {metadata.finishReason}</span>
        </div>
      </div>
    </div>
  );
}

function ProAnalysisPopup({ proAnalysis, proMetrics, onClose }: {
  proAnalysis: string;
  proMetrics?: ProAnalysisMetrics;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const hasUsedAnalysis = proAnalysis.length > 0;
  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

  return (
    <div
      ref={popupRef}
      className="absolute bottom-8 right-0 z-50 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 text-sm max-h-96 overflow-y-auto"
    >
      <div className="font-semibold text-gray-900 dark:text-white mb-2">Pro 디렉터 노트</div>

      {/* Flash가 참고한 이전 분석 */}
      <div className="border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">이전 분석 → Flash 참고</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${hasUsedAnalysis ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {hasUsedAnalysis ? '100% 포함' : '없음 (첫 턴)'}
          </span>
        </div>
        {hasUsedAnalysis && (
          <div className="text-gray-600 dark:text-gray-400 text-xs whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
            {proAnalysis}
          </div>
        )}
      </div>

      {/* 이번 턴 Pro 분석 */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">이번 턴 Pro 분석</span>
          {proMetrics?.status === 'pending' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              분석 중...
            </span>
          )}
          {proMetrics?.status === 'complete' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">완료</span>
          )}
          {proMetrics?.status === 'failed' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">실패</span>
          )}
        </div>

        {proMetrics?.status === 'complete' && proMetrics.analysis && (
          <>
            <div className="text-gray-700 dark:text-gray-300 text-xs whitespace-pre-wrap leading-relaxed mb-2">
              {proMetrics.analysis}
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Pro 분석 시간</span>
                <span className="text-gray-900 dark:text-white font-medium">{(proMetrics.timeMs / 1000).toFixed(1)}초</span>
              </div>
              <div className="flex justify-between">
                <span>입력 토큰</span>
                <span className="text-gray-900 dark:text-white">{fmt(proMetrics.promptTokens)}</span>
              </div>
              <div className="flex justify-between">
                <span>사고 토큰</span>
                <span className="text-purple-600 dark:text-purple-400">{fmt(proMetrics.thinkingTokens)}</span>
              </div>
              <div className="flex justify-between">
                <span>출력 토큰</span>
                <span className="text-gray-900 dark:text-white">{fmt(proMetrics.outputTokens)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>총 토큰</span>
                <span className="text-gray-900 dark:text-white">{fmt(proMetrics.totalTokens)}</span>
              </div>
              <div className="flex justify-between font-medium pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                <span>Pro 분석 비용</span>
                <span className="text-orange-600 dark:text-orange-400">{formatCost(calcProCost(proMetrics))}</span>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                {proMetrics.analysis.length}자 | 다음 턴 Flash 프롬프트에 100% 포함 예정
              </div>
            </div>
          </>
        )}

        {proMetrics?.status === 'pending' && (
          <div className="text-gray-500 dark:text-gray-400 text-xs">
            gemini-2.5-pro (thinking ON)로 서사 분석 중... 완료 후 다음 턴 Flash가 참고합니다.
          </div>
        )}

        {!proMetrics && (
          <div className="text-gray-500 dark:text-gray-400 text-xs">
            Pro 분석 대기 중. Flash 응답 완료 후 자동으로 시작됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

const INTIMACY_LABELS: Record<string, string> = {
  stranger: '처음 만남',
  acquaintance: '아는 사이',
  friend: '친구',
  close_friend: '절친',
  intimate: '특별한 사이',
};

const SURPRISE_LABELS: Record<string, { label: string; color: string }> = {
  save: { label: 'NEW', color: 'text-green-500' },
  reinforce: { label: 'REINFORCE', color: 'text-blue-500' },
  skip: { label: 'SKIP', color: 'text-gray-400' },
  no_facts: { label: '-', color: 'text-gray-300' },
};

function MemoryDebugPanel({ memoryDebug, memoryUpdateResults }: {
  memoryDebug: CharacterMemoryDebugData[];
  memoryUpdateResults?: MemoryUpdateResult[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (memoryDebug.length === 0) return null;

  // 접힌 상태: 한 줄 요약
  const totalMemories = memoryDebug.reduce((s, d) => s + d.recentMemoriesCount, 0);
  const summaryLine = memoryDebug.map(d => {
    const label = INTIMACY_LABELS[d.relationship.intimacyLevel] || d.relationship.intimacyLevel;
    return `${d.characterName}: ${label}`;
  }).join(' | ');

  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span className="text-gray-500 dark:text-gray-400">
          <span className="mr-1">🧠</span>
          {expanded ? 'Memory' : `${summaryLine} — 기억 ${totalMemories}개`}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-2">
          {memoryDebug.map((char) => {
            const updateResult = memoryUpdateResults?.find(r => r.characterId === char.characterId);
            const surprise = updateResult ? SURPRISE_LABELS[updateResult.surpriseAction] || SURPRISE_LABELS.no_facts : null;

            return (
              <div key={char.characterId} className="space-y-1">
                <div className="font-medium text-gray-700 dark:text-gray-300">{char.characterName}</div>

                {/* 관계 수치 */}
                <div className="flex flex-wrap gap-x-2 text-gray-500 dark:text-gray-400">
                  <span>{INTIMACY_LABELS[char.relationship.intimacyLevel] || char.relationship.intimacyLevel}</span>
                  <span>|</span>
                  <span>신뢰 <b className="text-gray-700 dark:text-gray-300">{char.relationship.trust.toFixed(0)}</b></span>
                  <span>호감 <b className="text-gray-700 dark:text-gray-300">{char.relationship.affection.toFixed(0)}</b></span>
                  <span>존경 <b className="text-gray-700 dark:text-gray-300">{char.relationship.respect.toFixed(0)}</b></span>
                  {char.relationship.rivalry > 0 && (
                    <span>경쟁 <b className="text-orange-500">{char.relationship.rivalry.toFixed(0)}</b></span>
                  )}
                  <span>친숙 <b className="text-gray-700 dark:text-gray-300">{char.relationship.familiarity.toFixed(0)}</b></span>
                </div>

                {/* 감정 흐름 */}
                {char.emotionalHistory.length > 0 && (
                  <div className="text-gray-500 dark:text-gray-400">
                    감정: {char.emotionalHistory.slice(-5).map((e, i) => (
                      <span key={i}>
                        {i > 0 && ' → '}
                        <span className="text-purple-500 dark:text-purple-400">{e.emotion}({(e.intensity * 100).toFixed(0)}%)</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* 기억/정보 카운트 */}
                <div className="flex gap-x-3 text-gray-500 dark:text-gray-400">
                  <span>기억 <b className="text-gray-700 dark:text-gray-300">{char.recentMemoriesCount}</b>개</span>
                  <span>알고있는 정보 <b className="text-gray-700 dark:text-gray-300">{char.knownFacts.length}</b>개</span>
                </div>

                {/* Surprise 결과 */}
                {surprise && updateResult && (
                  <div className="text-gray-500 dark:text-gray-400">
                    이번 턴: <span className={`font-medium ${surprise.color}`}>{surprise.label}</span>
                    {updateResult.surpriseScore > 0 && (
                      <span className="ml-1">(surprise: {updateResult.surpriseScore.toFixed(2)})</span>
                    )}
                    {updateResult.newFactsCount > 0 && (
                      <span className="ml-1">새 정보 {updateResult.newFactsCount}개</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChatMessages({
  messages,
  work,
  sending,
  generatingImages,
  responseMetadata,
  sidebarOpen,
  sidebarCollapsed,
  messagesEndRef,
  scrollContainerRef,
  onScroll,
  showScrollButton,
  onScrollToBottom,
  isAdmin,
}: ChatMessagesProps) {
  const [openMetadataId, setOpenMetadataId] = useState<string | null>(null);
  const [openProAnalysisId, setOpenProAnalysisId] = useState<string | null>(null);
  const sidebarMargin = sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : '';

  const handleInfoClick = useCallback((messageId: string) => {
    setOpenMetadataId(prev => prev === messageId ? null : messageId);
    setOpenProAnalysisId(null);
  }, []);

  const handleProAnalysisClick = useCallback((messageId: string) => {
    setOpenProAnalysisId(prev => prev === messageId ? null : messageId);
    setOpenMetadataId(null);
  }, []);

  const handleClosePopup = useCallback(() => {
    setOpenMetadataId(null);
    setOpenProAnalysisId(null);
  }, []);

  return (
    <main
      ref={scrollContainerRef as RefObject<HTMLElement>}
      onScroll={onScroll}
      className={`flex-1 overflow-y-auto pt-[120px] transition-all duration-300 ${sidebarMargin}`}
    >
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {messages.map(message => {
          const { messageType } = message;
          const character = message.character;
          const metadata = responseMetadata[message.id];

          if (messageType === 'system') {
            return (
              <div key={message.id} className="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 rounded-xl p-4 text-center animate-fade-in-up border border-primary-200 dark:border-primary-800">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{formatMessage(message.content)}</p>
              </div>
            );
          }

          if (messageType === 'narrator') {
            const isGeneratingSceneImage = generatingImages.has(message.id);
            return (
              <div key={message.id} className="relative">
                <div className="bg-gray-200 dark:bg-gray-700/50 rounded-xl p-4 animate-fade-in-up">
                  {message.generatedImageUrl && (
                    <div className="mb-3 -mx-2 -mt-2">
                      <img src={message.generatedImageUrl} alt="상황 이미지" className="w-full rounded-xl" loading="lazy" />
                    </div>
                  )}
                  {isGeneratingSceneImage && !message.generatedImageUrl && (
                    <div className="mb-3 -mx-2 -mt-2 bg-gray-100 dark:bg-gray-600 rounded-xl p-8 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm">상황 이미지 생성 중...</span>
                      </div>
                    </div>
                  )}
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed italic text-center">{formatMessage(message.content)}</p>
                </div>
                {isAdmin && metadata && (
                  <div className="flex justify-end mt-1 gap-1 relative">
                    <button
                      onClick={() => handleProAnalysisClick(message.id)}
                      className={`transition-colors p-1 ${metadata.proAnalysisMetrics?.status === 'pending' ? 'text-yellow-400 animate-pulse' : metadata.proAnalysisMetrics?.status === 'complete' || metadata.proAnalysis ? 'text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300' : 'text-gray-300 dark:text-gray-600'}`}
                      title="Pro 디렉터 노트"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleInfoClick(message.id)}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
                      title="AI 응답 정보"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </button>
                    {openMetadataId === message.id && (
                      <MetadataPopup metadata={metadata} onClose={handleClosePopup} />
                    )}
                    {openProAnalysisId === message.id && (
                      <ProAnalysisPopup proAnalysis={metadata.proAnalysis || ''} proMetrics={metadata.proAnalysisMetrics} onClose={handleClosePopup} />
                    )}
                  </div>
                )}
                {metadata?.memoryDebug && metadata.memoryDebug.length > 0 && (
                  <MemoryDebugPanel memoryDebug={metadata.memoryDebug} memoryUpdateResults={metadata.memoryUpdateResults} />
                )}
              </div>
            );
          }

          if (messageType === 'user') {
            return (
              <div key={message.id} className="flex justify-end animate-fade-in-up">
                <div className="max-w-[80%] bg-primary-600 text-white rounded-2xl rounded-tr-sm px-4 py-2">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            );
          }

          const isGeneratingImage = generatingImages.has(message.id);
          return (
            <div key={message.id} className="relative">
              <div className="flex items-start gap-3 animate-fade-in-up">
                <div className={`w-10 h-10 rounded-full ${getCharacterColor(message.characterId, work.characters)} flex-shrink-0 flex items-center justify-center overflow-hidden`}>
                  {character?.profileImage ? (
                    <img src={character.profileImage} alt={character.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-white">{character?.name?.[0] || '?'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{character?.name || '알 수 없음'}</p>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 shadow-sm">
                    {message.generatedImageUrl && (
                      <div className="mb-3 -mx-2 -mt-1">
                        <img src={message.generatedImageUrl} alt="상황 이미지" className="w-full rounded-xl" loading="lazy" />
                      </div>
                    )}
                    {isGeneratingImage && !message.generatedImageUrl && (
                      <div className="mb-3 -mx-2 -mt-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-4 flex items-center justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="text-sm">이미지 생성 중...</span>
                        </div>
                      </div>
                    )}
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{formatMessage(message.content)}</p>
                  </div>
                </div>
              </div>
              {isAdmin && metadata && (
                <div className="flex justify-end mt-1 gap-1 relative">
                  <button
                    onClick={() => handleProAnalysisClick(message.id)}
                    className={`transition-colors p-1 ${metadata.proAnalysisMetrics?.status === 'pending' ? 'text-yellow-400 animate-pulse' : metadata.proAnalysisMetrics?.status === 'complete' || metadata.proAnalysis ? 'text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300' : 'text-gray-300 dark:text-gray-600'}`}
                    title="Pro 디렉터 노트"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleInfoClick(message.id)}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1"
                    title="AI 응답 정보"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                  </button>
                  {openMetadataId === message.id && (
                    <MetadataPopup metadata={metadata} onClose={handleClosePopup} />
                  )}
                  {openProAnalysisId === message.id && (
                    <ProAnalysisPopup proAnalysis={metadata.proAnalysis || ''} proMetrics={metadata.proAnalysisMetrics} onClose={handleClosePopup} />
                  )}
                </div>
              )}
              {metadata?.memoryDebug && metadata.memoryDebug.length > 0 && (
                <MemoryDebugPanel memoryDebug={metadata.memoryDebug} memoryUpdateResults={metadata.memoryUpdateResults} />
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-3 animate-fade-in-up">
            <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-sm">캐릭터들이 반응 중...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button
          onClick={onScrollToBottom}
          className="fixed bottom-24 right-6 z-40 w-10 h-10 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 dark:hover:bg-gray-300 transition-all"
          title="아래로 스크롤"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </main>
  );
}
