'use client';

import { createContext, useContext, useRef, useCallback, ReactNode } from 'react';

interface Character {
  id: string;
  name: string;
  profileImage: string | null;
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

interface Message {
  id: string;
  characterId: string | null;
  content: string;
  messageType: 'dialogue' | 'narrator' | 'user' | 'system';
  createdAt: string;
  character?: Character | null;
  generatedImageUrl?: string | null;
}

interface CacheEntry {
  work: Work;
  session: Session | null;
  messages: Message[];
  timestamp: number;
}

interface ChatCacheContextType {
  getCache: (sessionId: string) => CacheEntry | null;
  setCache: (sessionId: string, data: Omit<CacheEntry, 'timestamp'>) => void;
  updateMessages: (sessionId: string, messages: Message[]) => void;
  updateSession: (sessionId: string, session: Session) => void;
  clearCache: (sessionId: string) => void;
}

const ChatCacheContext = createContext<ChatCacheContextType | undefined>(undefined);

const CACHE_TTL = 5 * 60 * 1000; // 5분
const MAX_CACHE_SIZE = 20;

export function ChatCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  // LRU 헬퍼: Map은 삽입 순서를 유지하므로, 접근 시 delete → re-insert로 "최근 사용"으로 이동
  const touchEntry = (key: string, entry: CacheEntry) => {
    cacheRef.current.delete(key);
    cacheRef.current.set(key, { ...entry, timestamp: Date.now() });
  };

  const getCache = useCallback((sessionId: string): CacheEntry | null => {
    const entry = cacheRef.current.get(sessionId);
    if (!entry) return null;
    // TTL 체크
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cacheRef.current.delete(sessionId);
      return null;
    }
    // LRU: 접근 시 최신으로 이동
    touchEntry(sessionId, entry);
    return entry;
  }, []);

  const setCache = useCallback((sessionId: string, data: Omit<CacheEntry, 'timestamp'>) => {
    // LRU: 기존 항목이면 삭제 후 재삽입
    cacheRef.current.delete(sessionId);
    cacheRef.current.set(sessionId, { ...data, timestamp: Date.now() });

    // LRU 제거: 캐시 크기 초과 시 가장 오래된(첫 번째) 항목 제거
    if (cacheRef.current.size > MAX_CACHE_SIZE) {
      const lruKey = cacheRef.current.keys().next().value;
      if (lruKey) cacheRef.current.delete(lruKey);
    }
  }, []);

  const updateMessages = useCallback((sessionId: string, messages: Message[]) => {
    const entry = cacheRef.current.get(sessionId);
    if (entry) {
      touchEntry(sessionId, { ...entry, messages });
    }
  }, []);

  const updateSession = useCallback((sessionId: string, session: Session) => {
    const entry = cacheRef.current.get(sessionId);
    if (entry) {
      touchEntry(sessionId, { ...entry, session });
    }
  }, []);

  const clearCache = useCallback((sessionId: string) => {
    cacheRef.current.delete(sessionId);
  }, []);

  return (
    <ChatCacheContext.Provider value={{ getCache, setCache, updateMessages, updateSession, clearCache }}>
      {children}
    </ChatCacheContext.Provider>
  );
}

export function useChatCache() {
  const context = useContext(ChatCacheContext);
  if (context === undefined) {
    throw new Error('useChatCache must be used within a ChatCacheProvider');
  }
  return context;
}
