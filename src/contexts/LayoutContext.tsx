'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface LayoutContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  sidebarRefreshKey: number;
  refreshSidebar: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const toggleSidebar = () => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setSidebarCollapsed(false);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // 사이드바 새로고침 트리거
  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <LayoutContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        sidebarRefreshKey,
        refreshSidebar,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
