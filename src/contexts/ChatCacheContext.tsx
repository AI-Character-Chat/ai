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
  getCache: (workId: string, sessionId?: string | null) => CacheEntry | null;
  setCache: (workId: string, sessionId: string | null, data: Omit<CacheEntry, 'timestamp'>) => void;
  updateMessages: (workId: string, sessionId: string, messages: Message[]) => void;
  updateSession: (workId: string, sessionId: string, session: Session) => void;
  clearCache: (workId: string, sessionId?: string | null) => void;
}

const ChatCacheContext = createContext<ChatCacheContextType | undefined>(undefined);

const CACHE_TTL = 5 * 60 * 1000; // 5분

function getCacheKey(workId: string, sessionId?: string | null): string {
  return sessionId ? `${workId}:${sessionId}` : workId;
}

export function ChatCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const getCache = useCallback((workId: string, sessionId?: string | null): CacheEntry | null => {
    const key = getCacheKey(workId, sessionId);
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    // TTL 체크
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cacheRef.current.delete(key);
      return null;
    }
    return entry;
  }, []);

  const setCache = useCallback((workId: string, sessionId: string | null, data: Omit<CacheEntry, 'timestamp'>) => {
    const key = getCacheKey(workId, sessionId);
    cacheRef.current.set(key, { ...data, timestamp: Date.now() });

    // 캐시 크기 제한 (최대 20개)
    if (cacheRef.current.size > 20) {
      const oldestKey = cacheRef.current.keys().next().value;
      if (oldestKey) cacheRef.current.delete(oldestKey);
    }
  }, []);

  const updateMessages = useCallback((workId: string, sessionId: string, messages: Message[]) => {
    const key = getCacheKey(workId, sessionId);
    const entry = cacheRef.current.get(key);
    if (entry) {
      cacheRef.current.set(key, { ...entry, messages, timestamp: Date.now() });
    }
  }, []);

  const updateSession = useCallback((workId: string, sessionId: string, session: Session) => {
    const key = getCacheKey(workId, sessionId);
    const entry = cacheRef.current.get(key);
    if (entry) {
      cacheRef.current.set(key, { ...entry, session, timestamp: Date.now() });
    }
  }, []);

  const clearCache = useCallback((workId: string, sessionId?: string | null) => {
    const key = getCacheKey(workId, sessionId);
    cacheRef.current.delete(key);
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
