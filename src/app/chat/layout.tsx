'use client';

import MainHeader from '@/components/MainHeader';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MainHeader />
      <ChatHistorySidebar />
      {children}
    </>
  );
}
