'use client';

export default function Error({
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
          문제가 발생했습니다
        </h2>
        <p className="text-gray-600 mb-6">
          페이지를 불러오는 중 오류가 발생했습니다.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
