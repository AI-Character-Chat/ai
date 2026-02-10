'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import MainHeader from '@/components/MainHeader';
import PersonaModal from '@/components/PersonaModal';
import PersonaDropdown from '@/components/PersonaDropdown';
import { useLayout } from '@/contexts/LayoutContext';

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
  generatedImageUrl?: string | null;  // 생성된 이미지 URL
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

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: authSession } = useSession();
  const { sidebarOpen, sidebarCollapsed, refreshSidebar } = useLayout();
  const workId = params.workId as string;
  const existingSessionId = searchParams.get('session');

  const [work, setWork] = useState<Work | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showOpeningSelect, setShowOpeningSelect] = useState(false);
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null);
  const [userName, setUserName] = useState('유저');
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());  // 이미지 생성 중인 메시지 ID

  // 페르소나 관련 상태
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);

  // 점3개 메뉴 상태
  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchWork();
    if (authSession?.user) {
      fetchPersonas();
    }
  }, [workId, authSession]);

  // 페르소나 목록 불러오기
  const fetchPersonas = async () => {
    try {
      const response = await fetch('/api/personas');
      const data = await response.json();
      const personaList = data.personas || [];
      setPersonas(personaList);

      // 기본 페르소나 선택
      const defaultPersona = personaList.find((p: Persona) => p.isDefault);
      if (defaultPersona) {
        setSelectedPersona(defaultPersona);
        setUserName(defaultPersona.name);
      }
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    }
  };

  // 페르소나 선택 시
  const handlePersonaSelect = async (persona: Persona) => {
    setSelectedPersona(persona);
    setUserName(persona.name);

    // 이미 세션이 있는 경우 서버에도 페르소나 변경 반영
    if (session) {
      try {
        await fetch(`/api/chat/session/${session.id}/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: persona.name,
            personaId: persona.id,  // 페르소나 ID도 전달 (전체 정보 업데이트용)
          }),
        });
        // 로컬 세션 상태도 업데이트
        setSession(prev => prev ? { ...prev, userName: persona.name } : prev);
      } catch (error) {
        console.error('Failed to update persona:', error);
      }
    }
  };

  // 기존 세션 불러오기
  useEffect(() => {
    if (existingSessionId && work) {
      loadExistingSession(existingSessionId);
    }
  }, [existingSessionId, work]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 전송 후 자동으로 입력란에 포커스
  useEffect(() => {
    // sending이 false가 되면 (응답 완료) 입력란에 포커스
    if (!sending && inputRef.current) {
      // 약간의 지연을 두어 DOM 업데이트 후 포커스
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [sending]);

  // 채팅방이 로드되고 세션이 있을 때 입력란에 자동 포커스
  useEffect(() => {
    if (session && !loading && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [session, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 상황 이미지 생성 (나레이터 메시지 + 캐릭터 프로필 + 대사 참조)
  const generateSceneImage = async (
    messageId: string,
    narratorText: string,
    characters: Array<{ name: string; profileImage: string | null }>,
    dialogues?: Array<{ name: string; dialogue: string }>
  ) => {
    // 이미 생성 중이면 스킵
    if (generatingImages.has(messageId)) return;

    // 캐릭터가 아예 없으면 스킵 (프로필 없는 캐릭터도 실루엣으로 표현 가능)
    if (!characters || characters.length === 0) {
      console.log('등장 캐릭터 없음, 이미지 생성 스킵');
      return;
    }

    setGeneratingImages(prev => new Set(prev).add(messageId));

    try {
      const charsWithProfile = characters.filter(c => c.profileImage);
      const charsWithoutProfile = characters.filter(c => !c.profileImage);

      console.log('🎨 상황 이미지 생성 요청:', { messageId, narratorText: narratorText.substring(0, 50) + '...' });
      console.log('✅ 프로필 있는 캐릭터:', charsWithProfile.map(c => c.name).join(', ') || '없음');
      console.log('👤 프로필 없는 캐릭터 (실루엣):', charsWithoutProfile.map(c => c.name).join(', ') || '없음');

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narratorText,
          characters,  // 모든 캐릭터 전달 (프로필 없는 것도 포함)
          dialogues: dialogues || [],  // 대사 정보 전달 (감정/행동 힌트용)
        }),
      });

      const data = await response.json();

      if (data.success && data.imageUrl) {
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, generatedImageUrl: data.imageUrl }
            : msg
        ));
        console.log('✅ 상황 이미지 생성 완료:', data.imageUrl);
      } else {
        console.error('❌ 상황 이미지 생성 실패:', data.error);
      }
    } catch (error) {
      console.error('❌ 상황 이미지 생성 에러:', error);
    } finally {
      setGeneratingImages(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const fetchWork = async () => {
    try {
      const response = await fetch(`/api/works/${workId}`);
      if (!response.ok) throw new Error('Work not found');
      const data = await response.json();
      setWork(data);

      // 기존 세션이 있으면 오프닝 선택 스킵
      if (existingSessionId) {
        // loadExistingSession에서 처리
        return;
      }

      // 오프닝이 2개 이상이면 선택 모달 표시
      if (data.openings.length > 1) {
        setShowOpeningSelect(true);
      } else if (data.openings.length === 1) {
        // 오프닝이 1개면 바로 시작
        setSelectedOpening(data.openings[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch work:', error);
    } finally {
      setLoading(false);
    }
  };

  // 기존 세션 불러오기
  const loadExistingSession = async (sessionId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/chat/session/${sessionId}`);

      if (!response.ok) {
        console.error('Failed to load session');
        // 세션 로드 실패 시 새 세션 시작하도록
        if (work?.openings.length === 1) {
          setSelectedOpening(work.openings[0].id);
        } else if (work?.openings.length && work.openings.length > 1) {
          setShowOpeningSelect(true);
        }
        return;
      }

      const data = await response.json();

      // 세션 설정
      const normalizedSession = {
        ...data.session,
        presentCharacters: Array.isArray(data.session.presentCharacters)
          ? data.session.presentCharacters
          : (typeof data.session.presentCharacters === 'string'
            ? JSON.parse(data.session.presentCharacters)
            : []),
        recentEvents: Array.isArray(data.session.recentEvents)
          ? data.session.recentEvents
          : (typeof data.session.recentEvents === 'string'
            ? JSON.parse(data.session.recentEvents)
            : []),
      };
      setSession(normalizedSession);
      setUserName(data.session.userName || '유저');

      // 메시지 설정
      if (data.messages && Array.isArray(data.messages)) {
        const formattedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          characterId: msg.characterId,
          content: msg.content,
          messageType: msg.messageType as 'dialogue' | 'narrator' | 'user' | 'system',
          createdAt: msg.createdAt,
          character: msg.character || null,
          generatedImageUrl: msg.generatedImageUrl || null,
        }));
        setMessages(formattedMessages);
      }

      setShowOpeningSelect(false);
    } catch (error) {
      console.error('Failed to load existing session:', error);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async () => {
    if (!work) return;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId,
          userName,
          openingId: selectedOpening,
          personaId: selectedPersona?.id,  // 선택된 페르소나 ID 전달
        }),
      });

      const data = await response.json();
      
      // presentCharacters와 recentEvents 정규화
      if (data.session) {
        const normalizedSession = {
          ...data.session,
          presentCharacters: Array.isArray(data.session.presentCharacters) 
            ? data.session.presentCharacters 
            : (typeof data.session.presentCharacters === 'string' 
                ? JSON.parse(data.session.presentCharacters) 
                : []),
          recentEvents: Array.isArray(data.session.recentEvents)
            ? data.session.recentEvents
            : (typeof data.session.recentEvents === 'string'
                ? JSON.parse(data.session.recentEvents)
                : []),
        };
        setSession(normalizedSession);
      } else {
        setSession(data.session);
      }
      setShowOpeningSelect(false);

      // 오프닝 메시지를 messages에 추가 (system 타입)
      const openingMessage: Message = {
        id: 'opening',
        characterId: null,
        content: data.opening,
        messageType: 'system',
        createdAt: new Date().toISOString(),
        character: null,
      };
      setMessages([openingMessage]);

      // 사이드바 채팅 목록 새로고침
      refreshSidebar();

      // 채팅 시작 후 입력란에 자동 포커스
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('채팅을 시작할 수 없습니다.');
    }
  };

  const sendMessage = async () => {
    if (!session || !inputMessage.trim() || sending) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    // 메시지 전송 직후에도 입력란에 포커스 유지
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    // 즉시 유저 메시지 표시 (임시)
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      characterId: null,
      content: userMessage,
      messageType: 'user',
      createdAt: new Date().toISOString(),
      character: null,
    };
    setMessages((prev) => [...prev, tempUserMessage]);

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

      // SSE 스트림 처리
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
                // 임시 메시지를 실제 메시지로 교체
                if (!userMessageReplaced) {
                  setMessages((prev) => [
                    ...prev.filter((m) => m.id !== tempUserMessage.id),
                    { ...parsed, messageType: 'user' },
                  ]);
                  userMessageReplaced = true;
                }
                break;

              case 'narrator':
                setMessages((prev) => [...prev, {
                  id: parsed.id || `narrator-${Date.now()}`,
                  characterId: null,
                  content: parsed.content,
                  messageType: 'narrator',
                  createdAt: new Date().toISOString(),
                  character: null,
                }]);
                break;

              case 'character_response':
                setMessages((prev) => [...prev, {
                  ...parsed,
                  messageType: 'dialogue' as const,
                }]);
                break;

              case 'session_update':
                if (parsed.session) {
                  const s = parsed.session;
                  setSession({
                    ...s,
                    presentCharacters: Array.isArray(s.presentCharacters)
                      ? s.presentCharacters
                      : (typeof s.presentCharacters === 'string' ? JSON.parse(s.presentCharacters) : []),
                    recentEvents: Array.isArray(s.recentEvents)
                      ? s.recentEvents
                      : (typeof s.recentEvents === 'string' ? JSON.parse(s.recentEvents) : []),
                  });
                }
                break;

              case 'error':
                throw new Error(parsed.error || '메시지 전송에 실패했습니다.');

              case 'done':
                break;
            }
          } catch (parseError) {
            if (eventType === 'error') {
              throw parseError;
            }
          }
        }
      }

      // 응답 받은 후 입력란에 자동 포커스
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : '메시지 전송에 실패했습니다.';

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMessage.id),
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
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter로 전송
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }

    // Ctrl+I 또는 Cmd+I: 상황묘사 (*로 감싸기)
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      handleActionDescriptionClick();
    }
  };

  // 상황묘사 버튼 클릭 핸들러
  const handleActionDescriptionClick = () => {
    if (!inputRef.current) return;

    const textarea = inputRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = inputMessage;

    // 텍스트가 선택된 경우 선택된 텍스트를 *로 감싸기
    if (start !== end) {
      const selectedText = text.substring(start, end);
      const newText = text.substring(0, start) + '*' + selectedText + '*' + text.substring(end);
      setInputMessage(newText);
      // 커서 위치를 * 뒤로 이동
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(end + 2, end + 2);
      }, 0);
    } else {
      // 선택된 텍스트가 없으면 ** 삽입하고 커서를 가운데에
      const newText = text.substring(0, start) + '**' + text.substring(end);
      setInputMessage(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
    }
  };

  // 텍스트에서 *행동* 형식을 이탤릭으로 변환
  const formatMessage = (text: string) => {
    // *행동* 형식을 span으로 변환
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
  };

  const getCharacterColor = (characterId: string | null) => {
    if (!characterId || !work) return 'bg-gray-200 dark:bg-gray-700';
    const index = work.characters.findIndex((c) => c.id === characterId);
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-orange-500',
      'bg-teal-500',
      'bg-indigo-500',
    ];
    return colors[index % colors.length];
  };

  // 현재 장면에 있는 캐릭터만 필터링
  const getPresentCharacters = () => {
    if (!work || !session) return [];

    // presentCharacters가 배열인지 확인하고 안전하게 처리
    let presentCharacterNames: string[] = [];

    if (Array.isArray(session.presentCharacters)) {
      presentCharacterNames = session.presentCharacters;
    } else if (typeof session.presentCharacters === 'string') {
      // JSON 문자열인 경우 파싱 시도
      try {
        const parsed = JSON.parse(session.presentCharacters);
        presentCharacterNames = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Failed to parse presentCharacters:', e);
        presentCharacterNames = [];
      }
    }

    // 캐릭터 이름으로 필터링 (부분 매칭 지원)
    // AI가 "미카엘"로 응답해도 "미카엘 팽송 (Michael Pinson)"과 매칭되도록
    return work.characters.filter((c) =>
      presentCharacterNames.some(presentName =>
        c.name === presentName ||
        c.name.includes(presentName) ||
        presentName.includes(c.name) ||
        c.name.split(' ')[0] === presentName.split(' ')[0] ||
        // 괄호 앞 이름으로 매칭 (예: "미카엘 팽송 (Michael)" -> "미카엘 팽송")
        c.name.split('(')[0].trim().includes(presentName) ||
        presentName.includes(c.name.split('(')[0].trim())
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600 dark:text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          작품을 찾을 수 없습니다.
        </p>
        <Link href="/" className="text-primary-600 hover:underline">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  // 오프닝 선택 화면
  if (showOpeningSelect || !session) {
    // 비로그인 유저는 로그인 유도
    if (!authSession?.user) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
          <MainHeader />
          <ChatHistorySidebar />
          <div className={`
            min-h-screen flex flex-col items-center justify-center p-4 pt-20
            transition-all duration-300
            ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
          `}>
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-center">
                <h1 className="text-2xl font-bold">{work.title}</h1>
                <p className="text-violet-100 mt-1">
                  {work.characters.length}명의 캐릭터와 대화하기
                </p>
              </div>
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    로그인이 필요합니다
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    캐릭터와의 대화를 시작하려면 로그인해주세요.<br/>
                    대화 내용은 저장되어 언제든 이어갈 수 있습니다.
                  </p>
                </div>
                <div className="space-y-3">
                  <Link
                    href="/login"
                    className="block w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors"
                  >
                    로그인하기
                  </Link>
                  <Link
                    href="/register"
                    className="block w-full py-3 border border-violet-600 text-violet-600 dark:text-violet-400 rounded-lg font-semibold hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                  >
                    회원가입하기
                  </Link>
                </div>
              </div>
            </div>
            <Link
              href="/"
              className="mt-4 text-gray-400 hover:text-white transition-colors"
            >
              ← 목록으로 돌아가기
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
        {/* 헤더 - 공통 컴포넌트 */}
        <MainHeader />

        {/* 사이드바 - 공통 컴포넌트 */}
        <ChatHistorySidebar />

        {/* 오프닝 선택 콘텐츠 */}
        <div className={`
          min-h-screen flex flex-col items-center justify-center p-4 pt-20
          transition-all duration-300
          ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}
        `}>
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
              <h1 className="text-2xl font-bold">{work.title}</h1>
              <p className="text-violet-100 mt-1">
                {work.characters.length}명의 캐릭터와 대화하기
              </p>
            </div>

          <div className="p-6 space-y-6">
            {/* 페르소나 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                페르소나
              </label>
              <div className="space-y-2">
                {/* 드롭다운 형식 페르소나 선택 */}
                <PersonaDropdown
                  personas={personas}
                  selectedPersona={selectedPersona}
                  onSelect={handlePersonaSelect}
                  onManageClick={() => setPersonaModalOpen(true)}
                />
                {personas.length === 0 && (
                  <button
                    onClick={() => setPersonaModalOpen(true)}
                    className="text-sm text-violet-500 hover:text-violet-400"
                  >
                    + 페르소나 추가하기
                  </button>
                )}
              </div>
            </div>

            {/* 캐릭터 미리보기 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                등장 캐릭터
              </label>
              <div className="flex -space-x-3">
                {work.characters.map((char) => (
                  <div
                    key={char.id}
                    className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden"
                    title={char.name}
                  >
                    {char.profileImage ? (
                      <img
                        src={char.profileImage}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-bold text-gray-500">
                        {char.name[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {work.characters.map((c) => c.name).join(', ')}
              </p>
            </div>

            {/* 오프닝 선택 */}
            {work.openings.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  시작 상황 선택
                </label>
                <div className="space-y-2">
                  {work.openings.map((opening) => (
                    <label
                      key={opening.id}
                      className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedOpening === opening.id
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="opening"
                          value={opening.id}
                          checked={selectedOpening === opening.id}
                          onChange={() => setSelectedOpening(opening.id)}
                          className="mr-3"
                        />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {opening.title}
                          </span>
                          {opening.isDefault && (
                            <span className="ml-2 text-xs text-violet-600">
                              (기본)
                            </span>
                          )}
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
              disabled={!selectedOpening && work.openings.length > 0}
              className="w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              대화 시작하기
            </button>
          </div>
        </div>

          <Link
            href="/"
            className="mt-4 text-gray-400 hover:text-white transition-colors"
          >
            ← 목록으로 돌아가기
          </Link>
        </div>

        {/* 페르소나 모달 */}
        <PersonaModal
          isOpen={personaModalOpen}
          onClose={() => {
            setPersonaModalOpen(false);
            fetchPersonas();
          }}
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
      {/* 헤더 - 공통 컴포넌트 */}
      <MainHeader />

      {/* 사이드바 - 공통 컴포넌트 */}
      <ChatHistorySidebar />

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
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {work.title}
                </h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>📍 {session.currentLocation}</span>
                  <span>•</span>
                  <span>🕐 {session.currentTime}</span>
                  <span>•</span>
                  <span>턴 {session.turnCount}</span>
                </div>
              </div>
            </div>

            {/* 현재 장면에 있는 캐릭터들 + 메뉴 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 hidden sm:block">함께하는 캐릭터:</span>
                <div className="flex -space-x-2">
                  {presentCharacters.map((char) => (
                    <div
                      key={char.id}
                      className={`w-7 h-7 rounded-full ${getCharacterColor(char.id)} border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden`}
                      title={char.name}
                    >
                      {char.profileImage ? (
                        <img
                          src={char.profileImage}
                          alt={char.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-white">
                          {char.name[0]}
                        </span>
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
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setChatMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[240px] overflow-hidden">
                      {/* 페르소나 변경 (로그인 유저만) */}
                      {authSession?.user && (
                        <div className="p-3">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            페르소나 선택
                          </div>
                          {/* 페르소나 목록 */}
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {personas.map((persona) => (
                              <button
                                key={persona.id}
                                onClick={() => {
                                  handlePersonaSelect(persona);
                                  setChatMenuOpen(false);
                                }}
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
                                    }`}>
                                      {persona.name}
                                    </span>
                                    {persona.isDefault && (
                                      <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">
                                        기본
                                      </span>
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
                          {/* 페르소나 관리 버튼 */}
                          <button
                            onClick={() => {
                              setChatMenuOpen(false);
                              setPersonaModalOpen(true);
                            }}
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
          {messages.map((message) => {
            const { messageType } = message;
            const character = message.character;

            // 시스템 메시지 (오프닝)
            if (messageType === 'system') {
              return (
                <div
                  key={message.id}
                  className="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 rounded-xl p-4 text-center animate-fade-in-up border border-primary-200 dark:border-primary-800"
                >
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {formatMessage(message.content)}
                  </p>
                </div>
              );
            }

            // 나레이터 메시지 (상황 이미지 포함)
            if (messageType === 'narrator') {
              const isGeneratingSceneImage = generatingImages.has(message.id);

              return (
                <div
                  key={message.id}
                  className="bg-gray-200 dark:bg-gray-700/50 rounded-xl p-4 animate-fade-in-up"
                >
                  {/* 상황 이미지 */}
                  {message.generatedImageUrl && (
                    <div className="mb-3 -mx-2 -mt-2">
                      <img
                        src={message.generatedImageUrl}
                        alt="상황 이미지"
                        className="w-full rounded-xl"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* 이미지 생성 중 표시 */}
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

                  {/* 나레이터 텍스트 */}
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed italic text-center">
                    {formatMessage(message.content)}
                  </p>
                </div>
              );
            }

            // 유저 메시지
            if (messageType === 'user') {
              return (
                <div
                  key={message.id}
                  className="flex justify-end animate-fade-in-up"
                >
                  <div className="max-w-[80%] bg-primary-600 text-white rounded-2xl rounded-tr-sm px-4 py-2">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            }

            // 캐릭터 메시지 (dialogue)
            const isGeneratingImage = generatingImages.has(message.id);

            return (
              <div
                key={message.id}
                className="flex items-start gap-3 animate-fade-in-up"
              >
                <div
                  className={`w-10 h-10 rounded-full ${getCharacterColor(message.characterId)} flex-shrink-0 flex items-center justify-center overflow-hidden`}
                >
                  {character?.profileImage ? (
                    <img
                      src={character.profileImage}
                      alt={character.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-white">
                      {character?.name?.[0] || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {character?.name || '알 수 없음'}
                  </p>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 shadow-sm">
                    {/* 생성된 상황 이미지 */}
                    {message.generatedImageUrl && (
                      <div className="mb-3 -mx-2 -mt-1">
                        <img
                          src={message.generatedImageUrl}
                          alt="상황 이미지"
                          className="w-full rounded-xl"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* 이미지 생성 중 표시 */}
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

                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                      {formatMessage(message.content)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 로딩 표시 */}
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
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  캐릭터들이 반응 중...
                </p>
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
            {/* 상황묘사 버튼 */}
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
              onChange={(e) => setInputMessage(e.target.value)}
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
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Enter 전송 · Shift+Enter 줄바꿈 · Ctrl+I 상황묘사
          </p>
        </div>
      </div>

      {/* 페르소나 모달 */}
      <PersonaModal
        isOpen={personaModalOpen}
        onClose={() => {
          console.log('Chat page: PersonaModal onClose called');
          setPersonaModalOpen(false);
          // 모달 닫힌 후에 페르소나 목록 새로고침
          setTimeout(() => {
            fetchPersonas();
          }, 100);
        }}
        onSelect={(persona) => {
          console.log('Chat page: onSelect called with', persona.name);
          handlePersonaSelect(persona);
        }}
        selectedPersonaId={selectedPersona?.id}
        showSelectMode={true}
      />
    </div>
  );
}
