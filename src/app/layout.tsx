import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import { LayoutProvider } from '@/contexts/LayoutContext';
import GlobalLayout from '@/components/GlobalLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SYNK Character Chat',
  description: 'AI 캐릭터와 대화하세요',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <AuthProvider>
          <LayoutProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
              <GlobalLayout>
                {children}
              </GlobalLayout>
            </div>
          </LayoutProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
