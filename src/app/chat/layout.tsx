'use client';

import MainHeader from '@/components/MainHeader';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import ChatView from '@/components/ChatView';
import { ChatCacheProvider } from '@/contexts/ChatCacheContext';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatCacheProvider>
      <MainHeader />
      <ChatHistorySidebar />
      <ChatView />
      {children}
    </ChatCacheProvider>
  );
}
