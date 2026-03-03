'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Comment } from './types';

interface CommentsSectionProps {
  workId: string;
  authorId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { user?: any } | null;
  getTimeAgo: (dateString: string) => string;
  scrollToComments?: boolean;
}

const popularEmojis = ['😊', '😂', '❤️', '👍', '🔥', '😍', '🥺', '😭', '🤔', '👏', '🎉', '✨', '💕', '😘', '🥰', '😎'];

const reportReasons = [
  { value: 'inappropriate', label: '선정적인 내용을 포함하고 있어요' },
  { value: 'profanity', label: '욕설을 포함하고 있어요' },
  { value: 'harassment', label: '불쾌한 대화를 포함하고 있어요' },
  { value: 'copyright', label: '저작권을 침해하고 있어요' },
  { value: 'other', label: '기타' },
];

export default function CommentsSection({ workId, authorId, session, getTimeAgo, scrollToComments }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState<'comment' | 'reply' | null>(null);
  const [commentMenuOpen, setCommentMenuOpen] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  // 댓글 로드
  useEffect(() => {
    fetchComments(workId);
  }, [workId]);

  // 댓글 섹션으로 스크롤
  useEffect(() => {
    if (scrollToComments && !commentsLoading && sectionRef.current && !scrolledRef.current) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scrolledRef.current = true;
      }, 300);
    }
  }, [scrollToComments, commentsLoading]);

  const fetchComments = async (wId: string) => {
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/comments?workId=${wId}`);
      const data = await response.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async (parentId?: string) => {
    const content = parentId ? replyContent : newComment;
    if (!content.trim() || !workId) return;

    setCommentSubmitting(true);
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId,
          content: content.trim(),
          parentId: parentId || null,
        }),
      });

      if (response.ok) {
        await fetchComments(workId);
        setNewComment('');
        setReplyContent('');
        setReplyingTo(null);
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/comments?commentId=${commentId}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchComments(workId);
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const handlePinComment = async (commentId: string, isPinned: boolean) => {
    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, isPinned }),
      });
      if (response.ok) {
        await fetchComments(workId);
      }
    } catch (error) {
      console.error('Failed to pin comment:', error);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!session?.user) return;

    try {
      const response = await fetch('/api/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });

      if (response.ok) {
        const data = await response.json();
        setComments((prev) =>
          prev.map((comment) => {
            if (comment.id === commentId) {
              return { ...comment, isLiked: data.isLiked, likeCount: data.likeCount };
            }
            return {
              ...comment,
              replies: comment.replies.map((reply) =>
                reply.id === commentId
                  ? { ...reply, isLiked: data.isLiked, likeCount: data.likeCount }
                  : reply
              ),
            };
          })
        );
      }
    } catch (error) {
      console.error('Failed to like comment:', error);
    }
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const insertEmoji = (emoji: string) => {
    if (showEmojiPicker === 'comment') {
      setNewComment((prev) => prev + emoji);
    } else if (showEmojiPicker === 'reply') {
      setReplyContent((prev) => prev + emoji);
    }
    setShowEmojiPicker(null);
  };

  const handleReportComment = async () => {
    if (!reportingCommentId || !reportReason) return;

    setReportSubmitting(true);
    try {
      const response = await fetch('/api/comments/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: reportingCommentId,
          reason: reportReason,
          description: reportDescription,
        }),
      });

      if (response.ok) {
        alert('신고가 접수되었습니다.');
        setReportModalOpen(false);
        setReportingCommentId(null);
        setReportReason('');
        setReportDescription('');
      } else {
        alert('신고 접수에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to report comment:', error);
      alert('신고 접수에 실패했습니다.');
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <>
      <div ref={sectionRef} className="pb-6 border-t border-gray-200 dark:border-gray-700">
        <div className="py-4 px-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            댓글 {comments.length > 0 && `(${comments.length})`}
          </h3>
        </div>

        {/* 댓글 작성 폼 */}
        {session?.user ? (
          <div className="px-6 pb-4">
            <div className="flex gap-3">
              <Link
                href={`/author/${session.user.id}`}
                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                    <span className="text-sm font-bold text-white">
                      {session.user.name?.[0] || '?'}
                    </span>
                  </div>
                )}
              </Link>
              <div className="flex-1">
                <div className="relative">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="댓글을 작성해주세요..."
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                    rows={2}
                    maxLength={500}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{newComment.length}/500</span>
                    <div className="relative">
                      <button
                        onClick={() => setShowEmojiPicker(showEmojiPicker === 'comment' ? null : 'comment')}
                        className="p-1.5 text-gray-500 hover:text-pink-500 transition-colors"
                        title="이모지"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      {showEmojiPicker === 'comment' && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(null)} />
                          <div className="absolute bottom-full left-0 mb-2 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 grid grid-cols-8 gap-1 w-64">
                            {popularEmojis.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => insertEmoji(emoji)}
                                className="p-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSubmitComment()}
                    disabled={!newComment.trim() || commentSubmitting}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {commentSubmitting ? '작성 중...' : '등록'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-4">
            <div className="text-center py-4 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                댓글을 작성하려면 로그인이 필요합니다.
              </p>
            </div>
          </div>
        )}

        {/* 댓글 목록 */}
        <div className="px-6">
          {commentsLoading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="space-y-3">
                  {/* 댓글 */}
                  <div className="flex gap-3">
                    <Link
                      href={`/author/${comment.user.id}`}
                      className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {comment.user.image ? (
                        <img
                          src={comment.user.image}
                          alt={comment.user.name || ''}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500">
                          <span className="text-sm font-bold text-white">
                            {comment.user.name?.[0] || '?'}
                          </span>
                        </div>
                      )}
                    </Link>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {comment.isPinned && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full text-xs font-medium">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 2a.75.75 0 01.75.75v5.59l1.95-2.1a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0L6.2 7.26a.75.75 0 111.1-1.02l1.95 2.1V2.75A.75.75 0 0110 2z" />
                                <path d="M5.273 4.5a1.25 1.25 0 00-1.205.918l-1.523 5.52c-.006.02-.01.041-.015.062H6a1 1 0 01.894.553l.448.894a1 1 0 00.894.553h3.438a1 1 0 00.86-.49l.606-1.02A1 1 0 0114 11h3.47a1.318 1.318 0 00-.015-.062l-1.523-5.52a1.25 1.25 0 00-1.205-.918H5.273z" />
                              </svg>
                              고정됨
                            </span>
                          )}
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {comment.user.name || '익명'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {getTimeAgo(comment.createdAt)}
                          </span>
                        </div>
                        {/* 더보기 메뉴 */}
                        <div className="relative">
                          <button
                            onClick={() => setCommentMenuOpen(commentMenuOpen === comment.id ? null : comment.id)}
                            className="flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="더보기"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                            </svg>
                          </button>
                          {commentMenuOpen === comment.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setCommentMenuOpen(null)} />
                              <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                                {session?.user?.id === authorId && (
                                  <button
                                    onClick={() => {
                                      setCommentMenuOpen(null);
                                      handlePinComment(comment.id, !comment.isPinned);
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill={comment.isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                    </svg>
                                    {comment.isPinned ? '고정 해제' : '댓글 고정'}
                                  </button>
                                )}
                                {(session?.user?.id === comment.user.id || session?.user?.id === authorId) && (
                                  <button
                                    onClick={() => {
                                      setCommentMenuOpen(null);
                                      handleDeleteComment(comment.id);
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    삭제
                                  </button>
                                )}
                                {session?.user && session.user.id !== comment.user.id && (
                                  <button
                                    onClick={() => {
                                      setCommentMenuOpen(null);
                                      setReportingCommentId(comment.id);
                                      setReportModalOpen(true);
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    신고하기
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mt-1 whitespace-pre-wrap">
                        {comment.content}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <button
                          onClick={() => session?.user && handleLikeComment(comment.id)}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            comment.isLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'
                          }`}
                          title="좋아요"
                        >
                          <svg className="w-4 h-4" fill={comment.isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          <span>{comment.likeCount || 0}</span>
                        </button>
                        <button
                          onClick={() => {
                            if (comment.replies.length > 0) {
                              toggleReplies(comment.id);
                            }
                            if (session?.user) {
                              setReplyingTo(replyingTo === comment.id ? null : comment.id);
                              if (!expandedReplies.has(comment.id) && comment.replies.length > 0) {
                                setExpandedReplies((prev) => new Set(prev).add(comment.id));
                              }
                            }
                          }}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            expandedReplies.has(comment.id) || replyingTo === comment.id
                              ? 'text-pink-500'
                              : 'text-gray-500 hover:text-pink-500'
                          }`}
                          title="답글"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          <span>{comment.replies.length}</span>
                        </button>
                      </div>

                      {/* 답글 작성 폼 */}
                      {replyingTo === comment.id && (
                        <div className="mt-3">
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type="text"
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="답글을 작성해주세요..."
                                className="w-full px-3 py-2 pr-10 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                maxLength={500}
                              />
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <button
                                  onClick={() => setShowEmojiPicker(showEmojiPicker === 'reply' ? null : 'reply')}
                                  className="p-1 text-gray-500 hover:text-pink-500 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                                {showEmojiPicker === 'reply' && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(null)} />
                                    <div className="absolute bottom-full right-0 mb-2 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 grid grid-cols-8 gap-1 w-64">
                                      {popularEmojis.map((emoji) => (
                                        <button
                                          key={emoji}
                                          onClick={() => insertEmoji(emoji)}
                                          className="p-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleSubmitComment(comment.id)}
                              disabled={!replyContent.trim() || commentSubmitting}
                              className="px-3 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              등록
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 대댓글 목록 */}
                  {comment.replies.length > 0 && expandedReplies.has(comment.id) && (
                    <div className="ml-10 mt-2 pl-4 border-l-2 border-pink-200 dark:border-pink-800/50 space-y-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-r-lg py-3 pr-3">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-2.5">
                          <Link
                            href={`/author/${reply.user.id}`}
                            className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {reply.user.image ? (
                              <img
                                src={reply.user.image}
                                alt={reply.user.name || ''}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500">
                                <span className="text-xs font-bold text-white">
                                  {reply.user.name?.[0] || '?'}
                                </span>
                              </div>
                            )}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 dark:text-white text-xs">
                                  {reply.user.name || '익명'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {getTimeAgo(reply.createdAt)}
                                </span>
                              </div>
                              <div className="relative">
                                <button
                                  onClick={() => setCommentMenuOpen(commentMenuOpen === reply.id ? null : reply.id)}
                                  className="flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                  title="더보기"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </button>
                                {commentMenuOpen === reply.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setCommentMenuOpen(null)} />
                                    <div className="absolute right-0 mt-1 w-28 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                                      {(session?.user?.id === reply.user.id || session?.user?.id === authorId) && (
                                        <button
                                          onClick={() => {
                                            setCommentMenuOpen(null);
                                            handleDeleteComment(reply.id);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                          삭제
                                        </button>
                                      )}
                                      {session?.user && session.user.id !== reply.user.id && (
                                        <button
                                          onClick={() => {
                                            setCommentMenuOpen(null);
                                            setReportingCommentId(reply.id);
                                            setReportModalOpen(true);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                          </svg>
                                          신고
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-sm mt-0.5 whitespace-pre-wrap">
                              {reply.content}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <button
                                onClick={() => session?.user && handleLikeComment(reply.id)}
                                className={`flex items-center gap-1 text-xs transition-colors ${
                                  reply.isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'
                                }`}
                                title="좋아요"
                              >
                                <svg className="w-3.5 h-3.5" fill={reply.isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                <span>{reply.likeCount || 0}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 댓글 신고 모달 */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setReportModalOpen(false);
            setReportingCommentId(null);
            setReportReason('');
            setReportDescription('');
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">댓글 신고하기</h3>
              <button
                onClick={() => {
                  setReportModalOpen(false);
                  setReportingCommentId(null);
                  setReportReason('');
                  setReportDescription('');
                }}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                댓글의 신고 사유를 선택해주세요
              </p>
              <div className="space-y-3">
                {reportReasons.map((reason) => (
                  <label key={reason.value} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      reportReason === reason.value
                        ? 'border-pink-500 bg-pink-500'
                        : 'border-gray-300 dark:border-gray-600 group-hover:border-pink-400'
                    }`}>
                      {reportReason === reason.value && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason.value}
                      checked={reportReason === reason.value}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="sr-only"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{reason.label}</span>
                  </label>
                ))}
              </div>

              {reportReason === 'other' && (
                <div className="mt-4">
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="신고 사유를 입력해주세요"
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                    rows={4}
                    maxLength={500}
                  />
                </div>
              )}
            </div>

            <div className="p-5 pt-0">
              <button
                onClick={handleReportComment}
                disabled={!reportReason || (reportReason === 'other' && !reportDescription.trim()) || reportSubmitting}
                className="w-full py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {reportSubmitting ? '제출 중...' : '제출'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
