export default function ChatLoading() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <div className="text-sm text-gray-500 dark:text-gray-400">로딩 중...</div>
      </div>
    </div>
  );
}
