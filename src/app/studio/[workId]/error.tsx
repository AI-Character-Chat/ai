'use client';

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          스튜디오 오류
        </h2>
        <p className="text-gray-600 mb-6">
          작품 편집기를 불러오는 중 문제가 발생했습니다.
        </p>
        <div className="space-x-4">
          <button
            onClick={reset}
            className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="inline-block px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            홈으로
          </a>
        </div>
      </div>
    </div>
  );
}
