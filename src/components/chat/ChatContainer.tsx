'use client';

import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLayout } from '@/contexts/LayoutContext';
import { useChatCache } from '@/contexts/ChatCacheContext';
import {
  chatReducer,
  initialChatState,
  type ChatMessage,
  type ChatSessionData,
  type ChatWork,
  type Persona,
} from './useChatReducer';
import OpeningScreen from './OpeningScreen';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function ChatContainer() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const { data: authSession } = useSession();
  const params = useParams();
  const searchParams = useSearchParams();
  const { sidebarOpen, sidebarCollapsed, refreshSidebar } = useLayout();
  const chatCache = useChatCache();

  const workId = params?.workId as string | undefined;
  const existingSessionId = searchParams?.get('session') || null;

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const activeWorkIdRef = useRef(workId);
  const activeSessionIdRef = useRef(existingSessionId);
  const pendingRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // ─── 스크롤 ───
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages]);

  // ─── 페르소나 로드 ───
  const fetchPersonas = useCallback(async () => {
    try {
      const response = await fetch('/api/personas');
      const data = await response.json();
      const personaList = data.personas || [];
      const defaultPersona = personaList.find((p: Persona) => p.isDefault) || null;
      dispatch({ type: 'SET_PERSONAS', personas: personaList, selected: defaultPersona });
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    }
  }, []);

  // ─── 페르소나 선택 ───
  const handlePersonaSelect = useCallback(async (persona: Persona) => {
    dispatch({ type: 'SET_PERSONAS', personas: state.personas, selected: persona });
    if (state.session) {
      try {
        await fetch(`/api/chat/session/${state.session.id}/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userName: persona.name, personaId: persona.id }),
        });
        dispatch({ type: 'UPDATE_SESSION', session: { userName: persona.name } });
      } catch (error) {
        console.error('Failed to update persona:', error);
      }
    }
  }, [state.personas, state.session]);

  // ─── 세션 정규화 헬퍼 ───
  const normalizeSession = (raw: any): ChatSessionData => ({
    ...raw,
    presentCharacters: Array.isArray(raw.presentCharacters)
      ? raw.presentCharacters
      : (typeof raw.presentCharacters === 'string' ? JSON.parse(raw.presentCharacters) : []),
    recentEvents: Array.isArray(raw.recentEvents)
      ? raw.recentEvents
      : (typeof raw.recentEvents === 'string' ? JSON.parse(raw.recentEvents) : []),
  });

  // ─── 기존 세션 불러오기 ───
  const loadExistingSession = useCallback(async (sessionId: string, currentWork: ChatWork | null) => {
    try {
      // 이전 재시도 타이머 정리
      if (pendingRetryRef.current) {
        clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = null;
      }

      const response = await fetch(`/api/chat/session/${sessionId}`);
      if (activeWorkIdRef.current !== workId || activeSessionIdRef.current !== sessionId) return;

      if (!response.ok) {
        console.error('Failed to load session');
        return;
      }

      const data = await response.json();
      if (activeWorkIdRef.current !== workId || activeSessionIdRef.current !== sessionId) return;

      const session = normalizeSession(data.session);
      const messages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
        id: msg.id,
        characterId: msg.characterId,
        content: msg.content,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
        character: msg.character || null,
        generatedImageUrl: msg.generatedImageUrl || null,
      }));

      dispatch({ type: 'LOAD_SESSION', session, messages });

      // DB에 저장된 메타데이터 복원 (새로고침 시에도 아이콘 유지)
      (data.messages || []).forEach((msg: any) => {
        if (msg.metadata) {
          try {
            dispatch({ type: 'SET_RESPONSE_METADATA', messageId: msg.id, metadata: JSON.parse(msg.metadata) });
          } catch { /* ignore */ }
        }
      });

      // 캐시 저장
      if (currentWork) {
        chatCache.setCache(sessionId, { work: currentWork, session, messages });
      }

      // AI 응답 대기 감지: 마지막 메시지가 user이면 백엔드가 아직 처리 중일 수 있음
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.messageType === 'user' && retryCountRef.current < 3) {
        retryCountRef.current++;
        dispatch({ type: 'SET_SENDING', sending: true });
        pendingRetryRef.current = setTimeout(() => {
          pendingRetryRef.current = null;
          if (activeSessionIdRef.current === sessionId) {
            loadExistingSession(sessionId, currentWork);
          }
        }, 2500);
      } else if (lastMsg && lastMsg.messageType === 'user' && retryCountRef.current >= 3) {
        // 재시도 한도 초과 → 응답 생성 실패로 간주
        dispatch({ type: 'SET_SENDING', sending: false });
      }
    } catch (error) {
      console.error('Failed to load existing session:', error);
    }
  }, [workId, chatCache]);

  // ─── 작품 데이터 로드 ───
  const fetchWork = useCallback(async (targetWorkId: string, targetSessionId: string | null) => {
    try {
      const response = await fetch(`/api/works/${targetWorkId}?lite=true`);
      if (!response.ok) throw new Error('Work not found');
      if (activeWorkIdRef.current !== targetWorkId) return;

      const data: ChatWork = await response.json();
      dispatch({ type: 'LOAD_WORK', work: data });

      if (targetSessionId) {
        loadExistingSession(targetSessionId, data);
      }
    } catch (error) {
      console.error('Failed to fetch work:', error);
    } finally {
      if (activeWorkIdRef.current === targetWorkId && state.phase === 'loading') {
        // 캐시 히트가 없었을 때만 phase 업데이트
      }
    }
  }, [loadExistingSession, state.phase]);

  // ─── Effect 1: workId 변경 → 전체 리셋 + 데이터 로드 ───
  useEffect(() => {
    abortControllerRef.current?.abort();
    activeWorkIdRef.current = workId;
    activeSessionIdRef.current = existingSessionId;

    if (!workId) {
      dispatch({ type: 'RESET' });
      return;
    }

    dispatch({ type: 'RESET' });
    retryCountRef.current = 0;
    if (pendingRetryRef.current) {
      clearTimeout(pendingRetryRef.current);
      pendingRetryRef.current = null;
    }

    // existingSessionId가 있으면 opening 깜빡임 방지를 위해 session-loading 설정
    if (existingSessionId) {
      dispatch({ type: 'SET_PHASE', phase: 'session-loading' });
    }

    // 캐시 체크
    const cached = existingSessionId ? chatCache.getCache(existingSessionId) : null;
    if (cached && cached.session) {
      dispatch({ type: 'LOAD_WORK', work: cached.work });
      dispatch({ type: 'LOAD_SESSION', session: cached.session, messages: cached.messages });
    }

    fetchWork(workId, existingSessionId);
    if (authSession?.user) fetchPersonas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId]);

  // ─── Effect 2: 세션 전환 (같은 작품 내) ───
  useEffect(() => {
    if (!workId || !state.work) return;
    if (activeWorkIdRef.current !== workId) return;
    if (existingSessionId === activeSessionIdRef.current) return;

    abortControllerRef.current?.abort();
    activeSessionIdRef.current = existingSessionId;
    retryCountRef.current = 0;
    if (pendingRetryRef.current) {
      clearTimeout(pendingRetryRef.current);
      pendingRetryRef.current = null;
    }

    // 상태 리셋
    dispatch({ type: 'SET_SENDING', sending: false });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'SET_MENU', open: false });

    if (existingSessionId) {
      const cached = chatCache.getCache(existingSessionId);
      if (cached && cached.session) {
        dispatch({ type: 'LOAD_SESSION', session: cached.session, messages: cached.messages });
      } else {
        dispatch({ type: 'SET_PHASE', phase: 'session-loading' });
      }
      loadExistingSession(existingSessionId, state.work);
    } else {
      dispatch({ type: 'SET_PHASE', phase: 'opening' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSessionId, state.work]);

  // ─── Cleanup: 언마운트 시 타이머 정리 ───
  useEffect(() => {
    return () => {
      if (pendingRetryRef.current) {
        clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = null;
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  // ─── Effect 3: authSession 변경 시 페르소나 로드 ───
  useEffect(() => {
    if (authSession?.user && workId) {
      fetchPersonas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession]);

  // ─── 새 채팅 시작 ───
  const startChat = useCallback(async (openingId: string | null) => {
    if (!state.work || !workId) return;

    const userName = state.selectedPersona?.name || '유저';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId,
          userName,
          openingId,
          personaId: state.selectedPersona?.id,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          window.location.href = '/login';
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 오류 (${response.status})`);
      }

      const data = await response.json();
      const session = normalizeSession(data.session);
      const openingMessage: ChatMessage = {
        id: 'opening',
        characterId: null,
        content: data.opening,
        messageType: 'system',
        createdAt: new Date().toISOString(),
        character: null,
      };

      dispatch({ type: 'LOAD_SESSION', session, messages: [openingMessage] });

      // 캐시 저장
      chatCache.setCache(session.id, {
        work: state.work,
        session,
        messages: [openingMessage],
      });

      refreshSidebar();
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('채팅을 시작할 수 없습니다.');
    }
  }, [state.work, state.selectedPersona, workId, chatCache, refreshSidebar]);

  // ─── 메시지 전송 (SSE 스트리밍) ───
  const sendMessage = useCallback(async () => {
    if (!state.session || !state.inputMessage.trim() || state.sending || !workId) return;

    const userMessage = state.inputMessage.trim();
    const sendingSessionId = state.session.id;

    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'SET_SENDING', sending: true });

    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      characterId: null,
      content: userMessage,
      messageType: 'user',
      createdAt: new Date().toISOString(),
      character: null,
    };
    dispatch({ type: 'ADD_MESSAGE', message: tempUserMessage });

    // AbortController 설정
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.session.id, content: userMessage }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

      const decoder = new TextDecoder();
      let buffer = '';
      let userMessageReplaced = false;
      // SSE 처리 중 메시지를 누적하기 위한 로컬 배열 (dispatch 사이 시차 문제 방지)
      let localNewMessages: ChatMessage[] = [];
      let lastAiMessageId = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // 세션 변경 → 스트림 중단
        if (activeSessionIdRef.current !== existingSessionId) {
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }

          if (!eventType || !data) continue;

          try {
            const parsed = JSON.parse(data);

            switch (eventType) {
              case 'user_message':
                if (!userMessageReplaced) {
                  // temp 메시지를 실제 메시지로 교체 - ADD_MESSAGE 대신 직접 교체
                  const realUserMsg: ChatMessage = { ...parsed, messageType: 'user' };
                  // 임시 메시지 제거 후 실제 메시지 추가를 위해 LOAD_SESSION은 부적합
                  // dispatch로 처리하기 어려우므로, 실제 ID만 기록
                  localNewMessages.push(realUserMsg);
                  userMessageReplaced = true;
                }
                break;

              case 'narrator': {
                const narratorMsg: ChatMessage = {
                  id: parsed.id || `narrator-${Date.now()}`,
                  characterId: null,
                  content: parsed.content,
                  messageType: 'narrator',
                  createdAt: new Date().toISOString(),
                  character: null,
                };
                dispatch({ type: 'ADD_MESSAGE', message: narratorMsg });
                localNewMessages.push(narratorMsg);
                lastAiMessageId = narratorMsg.id;
                break;
              }

              case 'character_response': {
                const charMsg: ChatMessage = { ...parsed, messageType: 'dialogue' as const };
                dispatch({ type: 'ADD_MESSAGE', message: charMsg });
                localNewMessages.push(charMsg);
                lastAiMessageId = charMsg.id;
                break;
              }

              case 'response_metadata':
                if (lastAiMessageId) {
                  dispatch({
                    type: 'SET_RESPONSE_METADATA',
                    messageId: lastAiMessageId,
                    metadata: parsed,
                  });
                }
                break;

              case 'session_update':
                if (parsed.session) {
                  const updatedSess = normalizeSession(parsed.session);
                  dispatch({ type: 'UPDATE_SESSION', session: updatedSess });
                  chatCache.updateSession(parsed.session.id, updatedSess);
                }
                break;

              case 'error':
                throw new Error(parsed.error || '메시지 전송에 실패했습니다.');

              case 'done':
                // Pro 분석 트리거 (별도 API — Vercel serverless 타임아웃 회피)
                if (lastAiMessageId && parsed.aiResponseSummary) {
                  const proMsgId = lastAiMessageId;
                  // 분석 중 상태 표시
                  dispatch({
                    type: 'SET_PRO_ANALYSIS_METRICS',
                    messageId: proMsgId,
                    metrics: { analysis: '', timeMs: 0, promptTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, status: 'pending' },
                  });
                  fetch('/api/chat/pro-analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sendingSessionId, messageId: proMsgId, userMessage, aiResponseSummary: parsed.aiResponseSummary }),
                  })
                    .then(r => r.ok ? r.json() : null)
                    .then(result => {
                      if (result) {
                        dispatch({
                          type: 'SET_PRO_ANALYSIS_METRICS',
                          messageId: proMsgId,
                          metrics: { ...result, status: result.analysis ? 'complete' : 'failed' },
                        });
                      }
                    })
                    .catch(() => {});
                }
                break;
            }
          } catch (parseError) {
            if (eventType === 'error') throw parseError;
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return; // 의도적 취소
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : '메시지 전송에 실패했습니다.';
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: `error-${Date.now()}`,
          characterId: null,
          content: `[시스템 오류] ${errorMessage}`,
          messageType: 'narrator',
          createdAt: new Date().toISOString(),
          character: null,
        },
      });
      dispatch({ type: 'SET_INPUT', text: userMessage });
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false });
    }
  }, [state.session, state.inputMessage, state.sending, workId, existingSessionId, chatCache]);

  // ─── 렌더링 ───

  if (!workId) return null;

  const sidebarMargin = sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : '';

  // 로딩 중 (초기 로딩 또는 세션 로딩)
  if (state.phase === 'loading' || state.phase === 'session-loading') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className={`flex items-center justify-center min-h-screen transition-all duration-300 ${sidebarMargin}`}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {state.work ? '대화 불러오는 중...' : '로딩 중...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 작품 없음
  if (!state.work) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">작품을 찾을 수 없습니다.</p>
        <Link href="/" className="text-primary-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  // 세션 대기 중 (phase는 다르지만 세션이 아직 미로드)
  if (!state.session && existingSessionId) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className={`flex items-center justify-center min-h-screen transition-all duration-300 ${sidebarMargin}`}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
            <div className="text-sm text-gray-500 dark:text-gray-400">대화 불러오는 중...</div>
          </div>
        </div>
      </div>
    );
  }

  // 오프닝 화면
  if (state.phase === 'opening' || !state.session) {
    return (
      <OpeningScreen
        work={state.work}
        personas={state.personas}
        selectedPersona={state.selectedPersona}
        isLoggedIn={!!authSession?.user}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        onPersonaSelect={handlePersonaSelect}
        onStart={startChat}
        onPersonasRefresh={fetchPersonas}
      />
    );
  }

  // 채팅 화면
  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      <ChatHeader
        work={state.work}
        session={state.session}
        personas={state.personas}
        selectedPersona={state.selectedPersona}
        chatMenuOpen={state.chatMenuOpen}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        onMenuToggle={() => dispatch({ type: 'SET_MENU', open: !state.chatMenuOpen })}
        onPersonaSelect={handlePersonaSelect}
        onPersonasRefresh={fetchPersonas}
      />

      <ChatMessages
        messages={state.messages}
        work={state.work}
        sending={state.sending}
        generatingImages={state.generatingImages}
        responseMetadata={state.responseMetadata}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        messagesEndRef={messagesEndRef}
        scrollContainerRef={scrollContainerRef}
        onScroll={handleScroll}
        showScrollButton={showScrollButton}
        onScrollToBottom={scrollToBottom}
        isAdmin={(authSession?.user as any)?.role === 'admin'}
      />

      <ChatInput
        inputMessage={state.inputMessage}
        sending={state.sending}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        onInputChange={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={sendMessage}
      />
    </div>
  );
}
