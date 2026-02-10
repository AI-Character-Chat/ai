'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PersonaModal from '@/components/PersonaModal';
import PersonaDropdown from '@/components/PersonaDropdown';
import { useLayout } from '@/contexts/LayoutContext';
import { useChatCache } from '@/contexts/ChatCacheContext';

interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

interface Character {
  id: string;
  name: string;
  profileImage: string | null;
}

interface Message {
  id: string;
  characterId: string | null;
  content: string;
  messageType: 'dialogue' | 'narrator' | 'user' | 'system';
  createdAt: string;
  character?: Character | null;
  generatedImageUrl?: string | null;
}

interface Opening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
  initialLocation?: string;
  initialTime?: string;
}

interface Work {
  id: string;
  title: string;
  characters: Character[];
  openings: Opening[];
}

interface Session {
  id: string;
  userName: string;
  intimacy: number;
  turnCount: number;
  currentLocation: string;
  currentTime: string;
  presentCharacters: string[];
  recentEvents: string[];
}

export default function ChatView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: authSession } = useSession();
  const { sidebarOpen, sidebarCollapsed, refreshSidebar } = useLayout();
  const chatCache = useChatCache();

  const workId = params?.workId as string | undefined;
  const existingSessionId = searchParams?.get('session') || null;

  const [work, setWork] = useState<Work | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [showOpeningSelect, setShowOpeningSelect] = useState(false);
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null);
  const [userName, setUserName] = useState('유저');
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeWorkIdRef = useRef(workId);
  const activeSessionIdRef = useRef(existingSessionId);

  // ─── workId 변경 감지 → 전체 리셋 + 데이터 로드 ───
  useEffect(() => {
    activeWorkIdRef.current = workId;
    activeSessionIdRef.current = existingSessionId;

    if (!workId) {
      setLoading(false);
      setWork(null);
      setSession(null);
      setMessages([]);
      return;
    }

    // 상태 리셋
    setShowOpeningSelect(false);
    setSelectedOpening(null);
    setSending(false);
    setStartingChat(false);
    setInputMessage('');
    setSessionLoading(false);
    setChatMenuOpen(false);
    setGeneratingImages(new Set());

    // 캐시 체크 → 즉시 렌더링
    const cached = existingSessionId ? chatCache.getCache(workId, existingSessionId) : null;
    if (cached) {
      setWork(cached.work);
      setSession(cached.session);
      setMessages(cached.messages);
      setLoading(false);
    } else {
      setSession(null);
      setMessages([]);
      setLoading(true);
    }

    fetchWork(workId, existingSessionId);
    if (authSession?.user) fetchPersonas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId]);

  // ─── 세션 전환 (같은 작품 내에서) ───
  useEffect(() => {
    if (!workId || !work) return;
    // workId 변경 시에는 위 effect에서 처리하므로 스킵
    if (activeWorkIdRef.current !== workId) return;
    if (existingSessionId === activeSessionIdRef.current) return;

    activeSessionIdRef.current = existingSessionId;

    if (existingSessionId) {
      const cached = chatCache.getCache(workId, existingSessionId);
      if (cached) {
        setSession(cached.session);
        setMessages(cached.messages);
        setShowOpeningSelect(false);
        setLoading(false);
        setSessionLoading(false);
      } else {
        setSessionLoading(true);
      }
      loadExistingSession(existingSessionId);
    } else {
      setSession(null);
      setMessages([]);
      if (work.openings.length > 1) {
        setShowOpeningSelect(true);
      } else if (work.openings.length === 1) {
        setSelectedOpening(work.openings[0].id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSessionId, work]);

  // ─── authSession 변경 시 페르소나 로드 ───
  useEffect(() => {
    if (authSession?.user && workId) {
      fetchPersonas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!sending && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [sending]);

  useEffect(() => {
    if (session && !loading && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [session, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ─── 페르소나 ───
  const fetchPersonas = async () => {
    try {
      const response = await fetch('/api/personas');
      const data = await response.json();
      const personaList = data.personas || [];
      setPersonas(personaList);
      const defaultPersona = personaList.find((p: Persona) => p.isDefault);
      if (defaultPersona) {
        setSelectedPersona(defaultPersona);
        setUserName(defaultPersona.name);
      }
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    }
  };

  const handlePersonaSelect = async (persona: Persona) => {
    setSelectedPersona(persona);
    setUserName(persona.name);
    if (session) {
      try {
        await fetch(`/api/chat/session/${session.id}/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userName: persona.name, personaId: persona.id }),
        });
        setSession(prev => prev ? { ...prev, userName: persona.name } : prev);
      } catch (error) {
        console.error('Failed to update persona:', error);
      }
    }
  };

  // ─── 이미지 생성 ───
  const generateSceneImage = async (
    messageId: string,
    narratorText: string,
    characters: Array<{ name: string; profileImage: string | null }>,
    dialogues?: Array<{ name: string; dialogue: string }>
  ) => {
    if (generatingImages.has(messageId)) return;
    if (!characters || characters.length === 0) return;

    setGeneratingImages(prev => new Set(prev).add(messageId));
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narratorText, characters, dialogues: dialogues || [] }),
      });
      const data = await response.json();
      if (data.success && data.imageUrl) {
        setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, generatedImageUrl: data.imageUrl } : msg
        ));
      }
    } catch (error) {
      console.error('Image generation error:', error);
    } finally {
      setGeneratingImages(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  // ─── 작품 데이터 로드 ───
  const fetchWork = async (targetWorkId: string, targetSessionId: string | null) => {
    try {
      const response = await fetch(`/api/works/${targetWorkId}`);
      if (!response.ok) throw new Error('Work not found');
      // 다른 작품으로 이동했으면 무시
      if (activeWorkIdRef.current !== targetWorkId) return;

      const data = await response.json();
      setWork(data);

      // 기존 세션 있으면 오프닝 선택 스킵 (loadExistingSession에서 처리)
      if (targetSessionId) {
        loadExistingSession(targetSessionId);
        return;
      }

      if (data.openings.length > 1) {
        setShowOpeningSelect(true);
      } else if (data.openings.length === 1) {
        setSelectedOpening(data.openings[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch work:', error);
    } finally {
      if (activeWorkIdRef.current === targetWorkId) {
        // 캐시 히트가 없었을 때만 로딩 해제
        setLoading(prev => prev ? false : prev);
      }
    }
  };

  // ─── 기존 세션 불러오기 ───
  const loadExistingSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/session/${sessionId}`);
      if (activeWorkIdRef.current !== workId) return;

      if (!response.ok) {
        console.error('Failed to load session');
        if (work?.openings.length === 1) {
          setSelectedOpening(work.openings[0].id);
        } else if (work?.openings.length && work.openings.length > 1) {
          setShowOpeningSelect(true);
        }
        return;
      }

      const data = await response.json();
      if (activeWorkIdRef.current !== workId) return;

      const normalizedSession = {
        ...data.session,
        presentCharacters: Array.isArray(data.session.presentCharacters)
          ? data.session.presentCharacters
          : (typeof data.session.presentCharacters === 'string'
            ? JSON.parse(data.session.presentCharacters) : []),
        recentEvents: Array.isArray(data.session.recentEvents)
          ? data.session.recentEvents
          : (typeof data.session.recentEvents === 'string'
            ? JSON.parse(data.session.recentEvents) : []),
      };
      setSession(normalizedSession);
      setUserName(data.session.userName || '유저');

      let formattedMessages: Message[] = [];
      if (data.messages && Array.isArray(data.messages)) {
        formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          characterId: msg.characterId,
          content: msg.content,
          messageType: msg.messageType as Message['messageType'],
          createdAt: msg.createdAt,
          character: msg.character || null,
          generatedImageUrl: msg.generatedImageUrl || null,
        }));
        setMessages(formattedMessages);
      }

      // 캐시 저장
      const currentWork = work;
      if (currentWork && workId) {
        chatCache.setCache(workId, sessionId, {
          work: currentWork,
          session: normalizedSession,
          messages: formattedMessages,
        });
      }

      setShowOpeningSelect(false);
    } catch (error) {
      console.error('Failed to load existing session:', error);
    } finally {
      setSessionLoading(false);
      setLoading(false);
    }
  };

  // ─── 새 채팅 시작 ───
  const startChat = async () => {
    if (!work || !workId) return;
    setStartingChat(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId,
          userName,
          openingId: selectedOpening,
          personaId: selectedPersona?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          window.location.href = '/login';
          return;
        }
        throw new Error(errorData.error || `서버 오류 (${response.status})`);
      }

      const data = await response.json();

      if (data.session) {
        const normalizedSession = {
          ...data.session,
          presentCharacters: Array.isArray(data.session.presentCharacters)
            ? data.session.presentCharacters
            : (typeof data.session.presentCharacters === 'string'
                ? JSON.parse(data.session.presentCharacters) : []),
          recentEvents: Array.isArray(data.session.recentEvents)
            ? data.session.recentEvents
            : (typeof data.session.recentEvents === 'string'
                ? JSON.parse(data.session.recentEvents) : []),
        };
        setSession(normalizedSession);
      } else {
        setSession(data.session);
      }
      setShowOpeningSelect(false);

      const openingMessage: Message = {
        id: 'opening',
        characterId: null,
        content: data.opening,
        messageType: 'system',
        createdAt: new Date().toISOString(),
        character: null,
      };
      setMessages([openingMessage]);

      // 캐시 저장
      if (data.session) {
        const normalizedSess = {
          ...data.session,
          presentCharacters: Array.isArray(data.session.presentCharacters)
            ? data.session.presentCharacters
            : (typeof data.session.presentCharacters === 'string'
                ? JSON.parse(data.session.presentCharacters) : []),
          recentEvents: Array.isArray(data.session.recentEvents)
            ? data.session.recentEvents
            : (typeof data.session.recentEvents === 'string'
                ? JSON.parse(data.session.recentEvents) : []),
        };
        chatCache.setCache(workId, data.session.id, {
          work,
          session: normalizedSess,
          messages: [openingMessage],
        });
      }

      refreshSidebar();
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('채팅을 시작할 수 없습니다.');
    } finally {
      setStartingChat(false);
    }
  };

  // ─── 메시지 전송 (SSE 스트리밍) ───
  const sendMessage = async () => {
    if (!session || !inputMessage.trim() || sending || !workId) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setTimeout(() => inputRef.current?.focus(), 50);

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      characterId: null,
      content: userMessage,
      messageType: 'user',
      createdAt: new Date().toISOString(),
      character: null,
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, content: userMessage }),
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

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
                  setMessages(prev => [
                    ...prev.filter(m => m.id !== tempUserMessage.id),
                    { ...parsed, messageType: 'user' },
                  ]);
                  userMessageReplaced = true;
                }
                break;

              case 'narrator':
                setMessages(prev => [...prev, {
                  id: parsed.id || `narrator-${Date.now()}`,
                  characterId: null,
                  content: parsed.content,
                  messageType: 'narrator',
                  createdAt: new Date().toISOString(),
                  character: null,
                }]);
                break;

              case 'character_response':
                setMessages(prev => [...prev, {
                  ...parsed,
                  messageType: 'dialogue' as const,
                }]);
                break;

              case 'session_update':
                if (parsed.session) {
                  const s = parsed.session;
                  const updatedSess = {
                    ...s,
                    presentCharacters: Array.isArray(s.presentCharacters)
                      ? s.presentCharacters
                      : (typeof s.presentCharacters === 'string' ? JSON.parse(s.presentCharacters) : []),
                    recentEvents: Array.isArray(s.recentEvents)
                      ? s.recentEvents
                      : (typeof s.recentEvents === 'string' ? JSON.parse(s.recentEvents) : []),
                  };
                  setSession(updatedSess);
                  if (workId) chatCache.updateSession(workId, s.id, updatedSess);
                }
                break;

              case 'error':
                throw new Error(parsed.error || '메시지 전송에 실패했습니다.');

              case 'done':
                if (session && workId) {
                  setMessages(prev => {
                    chatCache.updateMessages(workId, session.id, prev);
                    return prev;
                  });
                }
                break;
            }
          } catch (parseError) {
            if (eventType === 'error') throw parseError;
          }
        }
      }

      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : '메시지 전송에 실패했습니다.';
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMessage.id),
        {
          id: `error-${Date.now()}`,
          characterId: null,
          content: `[시스템 오류] ${errorMessage}`,
          messageType: 'narrator',
          createdAt: new Date().toISOString(),
          character: null,
        },
      ]);
      setInputMessage(userMessage);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      handleActionDescriptionClick();
    }
  };

  const handleActionDescriptionClick = () => {
    if (!inputRef.current) return;
    const textarea = inputRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = inputMessage;

    if (start !== end) {
      const selectedText = text.substring(start, end);
      const newText = text.substring(0, start) + '*' + selectedText + '*' + text.substring(end);
      setInputMessage(newText);
      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(end + 2, end + 2); }, 0);
    } else {
      const newText = text.substring(0, start) + '**' + text.substring(end);
      setInputMessage(newText);
      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 1, start + 1); }, 0);
    }
  };

  const formatMessage = useCallback((text: string) => {
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
  }, []);

  const getCharacterColor = useCallback((characterId: string | null) => {
    if (!characterId || !work) return 'bg-gray-200 dark:bg-gray-700';
    const index = work.characters.findIndex(c => c.id === characterId);
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'];
    return colors[index % colors.length];
  }, [work]);

  const getPresentCharacters = useCallback(() => {
    if (!work || !session) return [];
    let presentCharacterNames: string[] = [];
    if (Array.isArray(session.presentCharacters)) {
      presentCharacterNames = session.presentCharacters;
    } else if (typeof session.presentCharacters === 'string') {
      try {
        const parsed = JSON.parse(session.presentCharacters);
        presentCharacterNames = Array.isArray(parsed) ? parsed : [];
      } catch { presentCharacterNames = []; }
    }
    return work.characters.filter(c =>
      presentCharacterNames.some(presentName =>
        c.name === presentName || c.name.includes(presentName) || presentName.includes(c.name) ||
        c.name.split(' ')[0] === presentName.split(' ')[0] ||
        c.name.split('(')[0].trim().includes(presentName) || presentName.includes(c.name.split('(')[0].trim())
      )
    );
  }, [work, session]);

  // ─── 렌더링 ───

  // workId 없으면 아무것도 표시하지 않음
  if (!workId) return null;

  if (loading && !work) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className={`
          flex items-center justify-center min-h-screen
          transition-all duration-300
          ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
        `}>
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
            <div className="text-sm text-gray-500 dark:text-gray-400">로딩 중...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">작품을 찾을 수 없습니다.</p>
        <Link href="/" className="text-primary-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  // 오프닝 선택 화면
  if (showOpeningSelect || !session) {
    if (!authSession?.user) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
          <div className={`
            min-h-screen flex flex-col items-center justify-center p-4 pt-20
            transition-all duration-300
            ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
          `}>
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-center">
                <h1 className="text-2xl font-bold">{work.title}</h1>
                <p className="text-violet-100 mt-1">{work.characters.length}명의 캐릭터와 대화하기</p>
              </div>
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">로그인이 필요합니다</h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    캐릭터와의 대화를 시작하려면 로그인해주세요.<br/>대화 내용은 저장되어 언제든 이어갈 수 있습니다.
                  </p>
                </div>
                <div className="space-y-3">
                  <Link href="/login" className="block w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors">로그인하기</Link>
                  <Link href="/login" className="block w-full py-3 border border-violet-600 text-violet-600 dark:text-violet-400 rounded-lg font-semibold hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">회원가입하기</Link>
                </div>
              </div>
            </div>
            <Link href="/" className="mt-4 text-gray-400 hover:text-white transition-colors">← 목록으로 돌아가기</Link>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
        <div className={`
          min-h-screen flex flex-col items-center justify-center p-4 pt-20
          transition-all duration-300
          ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
        `}>
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
              <h1 className="text-2xl font-bold">{work.title}</h1>
              <p className="text-violet-100 mt-1">{work.characters.length}명의 캐릭터와 대화하기</p>
            </div>

            <div className="p-6 space-y-6">
              {/* 페르소나 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">페르소나</label>
                <div className="space-y-2">
                  <PersonaDropdown
                    personas={personas}
                    selectedPersona={selectedPersona}
                    onSelect={handlePersonaSelect}
                    onManageClick={() => setPersonaModalOpen(true)}
                  />
                  {personas.length === 0 && (
                    <button onClick={() => setPersonaModalOpen(true)} className="text-sm text-violet-500 hover:text-violet-400">
                      + 페르소나 추가하기
                    </button>
                  )}
                </div>
              </div>

              {/* 캐릭터 미리보기 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">등장 캐릭터</label>
                <div className="flex -space-x-3">
                  {work.characters.map(char => (
                    <div key={char.id} className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden" title={char.name}>
                      {char.profileImage ? (
                        <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-gray-500">{char.name[0]}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">{work.characters.map(c => c.name).join(', ')}</p>
              </div>

              {/* 오프닝 선택 */}
              {work.openings.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">시작 상황 선택</label>
                  <div className="space-y-2">
                    {work.openings.map(opening => (
                      <label
                        key={opening.id}
                        className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedOpening === opening.id
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center">
                          <input type="radio" name="opening" value={opening.id} checked={selectedOpening === opening.id} onChange={() => setSelectedOpening(opening.id)} className="mr-3" />
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{opening.title}</span>
                            {opening.isDefault && <span className="ml-2 text-xs text-violet-600">(기본)</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 시작 버튼 */}
              <button
                onClick={startChat}
                disabled={startingChat || (!selectedOpening && work.openings.length > 0)}
                className="w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {startingChat ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    대화 준비 중...
                  </>
                ) : (
                  '대화 시작하기'
                )}
              </button>
            </div>
          </div>

          <Link href="/" className="mt-4 text-gray-400 hover:text-white transition-colors">← 목록으로 돌아가기</Link>
        </div>

        <PersonaModal
          isOpen={personaModalOpen}
          onClose={() => { setPersonaModalOpen(false); fetchPersonas(); }}
          onSelect={handlePersonaSelect}
          selectedPersonaId={selectedPersona?.id}
          showSelectMode={true}
        />
      </div>
    );
  }

  const presentCharacters = getPresentCharacters();

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* 채팅 정보 서브헤더 */}
      <div className={`
        bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700
        fixed top-[64px] right-0 z-40
        transition-all duration-300
        ${sidebarOpen && !sidebarCollapsed ? 'lg:left-80' : sidebarOpen && sidebarCollapsed ? 'lg:left-16' : 'left-0'}
      `}>
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-sm">{work.title}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>📍 {session.currentLocation}</span>
                  <span>•</span>
                  <span>🕐 {session.currentTime}</span>
                  <span>•</span>
                  <span>턴 {session.turnCount}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 hidden sm:block">함께하는 캐릭터:</span>
                <div className="flex -space-x-2">
                  {presentCharacters.map(char => (
                    <div
                      key={char.id}
                      className={`w-7 h-7 rounded-full ${getCharacterColor(char.id)} border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden`}
                      title={char.name}
                    >
                      {char.profileImage ? (
                        <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-white">{char.name[0]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 점3개 메뉴 */}
              <div className="relative">
                <button
                  onClick={() => setChatMenuOpen(!chatMenuOpen)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="18" r="2" />
                  </svg>
                </button>

                {chatMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[240px] overflow-hidden">
                      {authSession?.user && (
                        <div className="p-3">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            페르소나 선택
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {personas.map(persona => (
                              <button
                                key={persona.id}
                                onClick={() => { handlePersonaSelect(persona); setChatMenuOpen(false); }}
                                className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                                  selectedPersona?.id === persona.id
                                    ? 'bg-violet-100 dark:bg-violet-900/30'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${
                                      selectedPersona?.id === persona.id
                                        ? 'text-violet-600 dark:text-violet-400'
                                        : 'text-gray-900 dark:text-white'
                                    }`}>{persona.name}</span>
                                    {persona.isDefault && (
                                      <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">기본</span>
                                    )}
                                  </div>
                                  {selectedPersona?.id === persona.id && (
                                    <svg className="w-4 h-4 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => { setChatMenuOpen(false); setPersonaModalOpen(true); }}
                            className="w-full mt-2 px-3 py-2 text-left text-sm text-violet-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            페르소나 관리
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <main className={`
        flex-1 overflow-y-auto pt-[120px]
        transition-all duration-300
        ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
      `}>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {sessionLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">대화 불러오는 중...</span>
              </div>
            </div>
          )}
          {!sessionLoading && messages.map(message => {
            const { messageType } = message;
            const character = message.character;

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
                <div key={message.id} className="bg-gray-200 dark:bg-gray-700/50 rounded-xl p-4 animate-fade-in-up">
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
              <div key={message.id} className="flex items-start gap-3 animate-fade-in-up">
                <div className={`w-10 h-10 rounded-full ${getCharacterColor(message.characterId)} flex-shrink-0 flex items-center justify-center overflow-hidden`}>
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
      </main>

      {/* Input Area */}
      <div className={`
        bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700
        transition-all duration-300
        ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
      `}>
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <button
              onClick={handleActionDescriptionClick}
              disabled={sending}
              className="px-3 py-2 text-lg font-bold text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="상황/행동 묘사 (Ctrl+I)"
            >
              ✱
            </button>
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (*행동묘사*로 상황을 표현할 수 있습니다)"
              rows={1}
              disabled={sending}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !inputMessage.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">Enter 전송 · Shift+Enter 줄바꿈 · Ctrl+I 상황묘사</p>
        </div>
      </div>

      <PersonaModal
        isOpen={personaModalOpen}
        onClose={() => { setPersonaModalOpen(false); setTimeout(() => fetchPersonas(), 100); }}
        onSelect={persona => handlePersonaSelect(persona)}
        selectedPersonaId={selectedPersona?.id}
        showSelectMode={true}
      />
    </div>
  );
}
