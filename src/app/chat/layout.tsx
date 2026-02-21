'use client';

import ChatContainer from '@/components/chat/ChatContainer';
import { ChatCacheProvider } from '@/contexts/ChatCacheContext';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatCacheProvider>
      <ChatContainer />
      {children}
    </ChatCacheProvider>
  );
}
