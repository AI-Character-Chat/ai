'use client';

import ReactMarkdown from 'react-markdown';

/**
 * 마크다운 렌더러 — 세계관, 캐릭터 프롬프트, 오프닝 등에서 사용
 * 작품정보/로어북에서는 사용하지 않음
 */
export default function MarkdownRenderer({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5 text-gray-900 dark:text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 text-gray-900 dark:text-white">{children}</h3>,
          p: ({ children }) => <p className="mb-2 leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-gray-700 dark:text-gray-300">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-gray-700 dark:text-gray-300">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-500 dark:text-gray-400">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary-400 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
              {children}
            </code>
          ),
          hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
