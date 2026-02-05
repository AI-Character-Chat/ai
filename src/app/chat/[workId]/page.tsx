'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
  const workId = params.workId as string;

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
  const [showDebugPanel, setShowDebugPanel] = useState(false);  // 디버그 패널 표시

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchWork();
  }, [workId]);

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

    // 즉시 유저 메시지 표시
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
        body: JSON.stringify({
          sessionId: session.id,
          content: userMessage,
        }),
      });

      // HTTP 에러 상태 확인
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // API 응답에 에러가 있는지 확인
      if (data.error) {
        throw new Error(data.error);
      }

      // 새 메시지들 구성
      const newMessages: Message[] = [];

      // 유저 메시지
      if (data.userMessage) {
        newMessages.push({
          ...data.userMessage,
          messageType: 'user',
        });
      }

      // 나레이터 메시지 (있는 경우)
      let narratorMessageId: string | null = null;
      let narratorText: string | null = null;
      if (data.narratorNote) {
        narratorMessageId = `narrator-${Date.now()}`;
        narratorText = data.narratorNote;
        newMessages.push({
          id: narratorMessageId,
          characterId: null,
          content: data.narratorNote,
          messageType: 'narrator',
          createdAt: new Date().toISOString(),
          character: null,
        });
      }

      // 캐릭터 응답들
      if (data.characterResponses && Array.isArray(data.characterResponses)) {
        data.characterResponses.forEach((r: Message) => {
          const msg: Message = {
            ...r,
            messageType: 'dialogue' as const,
          };
          newMessages.push(msg);
        });
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMessage.id),
        ...newMessages,
      ]);

      // [임시 비활성화] 상황 이미지 생성 요청
      // TODO: 스프라이트 시스템 구축 후 재활성화
      // if (narratorMessageId && narratorText && data.presentCharacters) {
      //   generateSceneImage(
      //     narratorMessageId,
      //     narratorText,
      //     data.presentCharacters,
      //     data.characterDialogues
      //   );
      // }

      if (data.session) {
        // presentCharacters가 배열인지 확인하고 정규화
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
      }
      
      // 응답 받은 후 입력란에 자동 포커스
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : '메시지 전송에 실패했습니다.';
      
      // 에러 메시지를 나레이터 메시지로 표시
      const errorNarratorMessage: Message = {
        id: `error-${Date.now()}`,
        characterId: null,
        content: `[시스템 오류] ${errorMessage}`,
        messageType: 'narrator',
        createdAt: new Date().toISOString(),
        character: null,
      };
      
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMessage.id),
        errorNarratorMessage,
      ]);
      
      // 실패 시 임시 메시지 제거
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      setInputMessage(userMessage);
    } finally {
      setSending(false);
      // 에러 발생 후에도 입력란에 포커스
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
    
    // 캐릭터 이름으로 필터링 (정확한 매칭만 사용)
    return work.characters.filter((c) => presentCharacterNames.includes(c.name));
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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-800">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
            <h1 className="text-2xl font-bold">{work.title}</h1>
            <p className="text-primary-100 mt-1">
              {work.characters.length}명의 캐릭터와 대화하기
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* 유저 이름 입력 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                닉네임
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="닉네임을 입력하세요"
              />
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
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
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
                            <span className="ml-2 text-xs text-primary-600">
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
              className="w-full py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    );
  }

  const presentCharacters = getPresentCharacters();

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white">
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

            {/* 현재 장면에 있는 캐릭터들 */}
            <div className="flex items-center gap-2">
              {/* 디버그 버튼 */}
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-2 rounded-lg transition-colors ${
                  showDebugPanel
                    ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="기억력 테스트 패널"
              >
                🧠
              </button>
              <span className="text-xs text-gray-400 hidden sm:block">함께하는 캐릭터:</span>
              <div className="flex -space-x-2">
                {presentCharacters.map((char) => (
                  <div
                    key={char.id}
                    className={`w-8 h-8 rounded-full ${getCharacterColor(char.id)} border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden`}
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
          </div>
        </div>
      </header>

      {/* 디버그 패널 - 기억력 테스트 */}
      {showDebugPanel && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                🧠 기억력 테스트 패널
              </h3>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800"
              >
                ✕
              </button>
            </div>

            {/* 대화 통계 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-2xl font-bold text-primary-600">{session?.turnCount || 0}</div>
                <div className="text-xs text-gray-500">총 턴 수</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-2xl font-bold text-green-600">{messages.length}</div>
                <div className="text-xs text-gray-500">메시지 수</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {messages.filter(m => m.messageType === 'user').length}
                </div>
                <div className="text-xs text-gray-500">유저 발화</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.min(30, messages.length)}
                </div>
                <div className="text-xs text-gray-500">기억 범위 (최근 30턴)</div>
              </div>
            </div>

            {/* 기억 테스트 버튼들 */}
            <div className="mb-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                📌 아래 버튼을 눌러 캐릭터의 기억력을 테스트하세요:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setInputMessage('내 이름이 뭐야?')}
                  className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                  이름 기억?
                </button>
                <button
                  onClick={() => setInputMessage('우리가 처음 만났을 때 어땠어?')}
                  className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-sm hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                >
                  첫 만남 기억?
                </button>
                <button
                  onClick={() => setInputMessage('내가 좋아한다고 했던 거 기억해?')}
                  className="px-3 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-full text-sm hover:bg-pink-200 dark:hover:bg-pink-800 transition-colors"
                >
                  선호도 기억?
                </button>
                <button
                  onClick={() => setInputMessage('아까 네가 뭐라고 했었지?')}
                  className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-sm hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                >
                  최근 대화?
                </button>
                <button
                  onClick={() => setInputMessage('우리가 함께 했던 일 중에 기억나는 거 있어?')}
                  className="px-3 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded-full text-sm hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                >
                  주요 이벤트?
                </button>
              </div>
            </div>

            {/* 정보 입력 테스트 */}
            <div className="mb-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                💡 먼저 정보를 알려주고, 나중에 기억하는지 테스트하세요:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setInputMessage('참고로 나는 고양이를 정말 좋아해')}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  선호도 알려주기
                </button>
                <button
                  onClick={() => setInputMessage('내 직업은 프로그래머야')}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  직업 알려주기
                </button>
                <button
                  onClick={() => setInputMessage('어제가 내 생일이었어')}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  생일 알려주기
                </button>
                <button
                  onClick={() => setInputMessage('나는 매운 음식을 잘 못 먹어')}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  음식 취향 알려주기
                </button>
              </div>
            </div>

            {/* AI 컨텍스트 미리보기 */}
            <details className="text-xs">
              <summary className="cursor-pointer text-yellow-700 dark:text-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200">
                🔍 AI에게 전달되는 대화 히스토리 미리보기 (최근 5개)
              </summary>
              <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                {messages.slice(-5).map((msg, idx) => (
                  <div key={idx} className="mb-1 text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">
                      {msg.messageType === 'user'
                        ? session?.userName
                        : msg.character?.name || '나레이터'}:
                    </span>{' '}
                    <span className="truncate">
                      {msg.content.substring(0, 100)}
                      {msg.content.length > 100 ? '...' : ''}
                    </span>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-gray-400">아직 대화가 없습니다.</p>
                )}
              </div>
            </details>

            {/* 경고 메시지 */}
            {messages.length > 25 && (
              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-xs text-red-700 dark:text-red-300">
                ⚠️ 대화가 30턴에 가까워지고 있습니다. 30턴 이전의 대화는 AI가 기억하지 못할 수 있습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
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
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
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
    </div>
  );
}
