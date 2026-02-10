'use client';

import { memo } from 'react';
import MainHeader from '@/components/MainHeader';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import ChatView from '@/components/ChatView';
import { ChatCacheProvider } from '@/contexts/ChatCacheContext';

// memo로 감싸서 ChatView 리렌더 시 헤더/사이드바 리렌더 방지
const MemoizedHeader = memo(MainHeader);
const MemoizedSidebar = memo(ChatHistorySidebar);

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatCacheProvider>
      <MemoizedHeader />
      <MemoizedSidebar />
      <ChatView />
      {children}
    </ChatCacheProvider>
  );
}
