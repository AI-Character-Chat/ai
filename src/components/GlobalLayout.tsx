'use client';

import { usePathname } from 'next/navigation';
import { useLayout } from '@/contexts/LayoutContext';
import MainHeader from '@/components/MainHeader';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';

// Header/Sidebar를 숨길 경로
const HIDE_NAV_PATHS = ['/login', '/admin'];

export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, sidebarCollapsed } = useLayout();

  const hideNav = HIDE_NAV_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (hideNav) return <>{children}</>;

  // /chat 은 ChatContainer가 자체 레이아웃(pt-16, ml) 관리
  const isChatPage = pathname.startsWith('/chat');

  const sidebarMargin =
    sidebarOpen && !sidebarCollapsed
      ? 'lg:ml-80'
      : sidebarOpen && sidebarCollapsed
        ? 'lg:ml-16'
        : '';

  return (
    <>
      <MainHeader />
      <ChatHistorySidebar />
      {isChatPage ? (
        children
      ) : (
        <div className={`pt-16 transition-all duration-300 ${sidebarMargin}`}>
          {children}
        </div>
      )}
    </>
  );
}
