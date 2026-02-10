'use client';

import { RefObject } from 'react';

interface ProfileForm {
  nickname: string;
  bio: string;
  birthDate: string;
  gender: 'male' | 'female' | 'private';
}

interface ProfileEditModalProps {
  profileForm: ProfileForm;
  profileImage: string | null;
  profileImageInputRef: RefObject<HTMLInputElement | null>;
  profileSaving: boolean;
  profileImageUploading: boolean;
  userEmail: string | null | undefined;
  onFormChange: (form: ProfileForm) => void;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ProfileEditModal({
  profileForm, profileImage, profileImageInputRef,
  profileSaving, profileImageUploading, userEmail,
  onFormChange, onImageChange, onSave, onClose,
}: ProfileEditModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="w-8" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">프로필 수정</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Profile Image */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <input
                type="file"
                ref={profileImageInputRef}
                onChange={onImageChange}
                accept="image/*"
                className="hidden"
              />
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={profileForm.nickname || ''}
                  className="w-24 h-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {profileForm.nickname?.[0] || '?'}
                  </span>
                </div>
              )}
              <button
                onClick={() => profileImageInputRef.current?.click()}
                disabled={profileImageUploading}
                className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {profileImageUploading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            {/* Nickname */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                필명
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={profileForm.nickname}
                  onChange={(e) => onFormChange({ ...profileForm, nickname: e.target.value.slice(0, 20) })}
                  placeholder="필명을 입력하세요"
                  maxLength={20}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
                  {profileForm.nickname.length}/20
                </span>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                작가소개
              </label>
              <div className="relative">
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => onFormChange({ ...profileForm, bio: e.target.value.slice(0, 500) })}
                  placeholder="작가소개를 입력하세요"
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                />
                <span className="absolute right-3 bottom-3 text-xs text-gray-400 dark:text-gray-500">
                  {profileForm.bio.length}/500
                </span>
              </div>
            </div>

            {/* Birth Date */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                생년월일
              </label>
              <input
                type="date"
                value={profileForm.birthDate}
                onChange={(e) => onFormChange({ ...profileForm, birthDate: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                성별
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onFormChange({ ...profileForm, gender: 'female' })}
                  className={`py-3 rounded-xl font-medium transition-colors ${
                    profileForm.gender === 'female'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  여성
                </button>
                <button
                  type="button"
                  onClick={() => onFormChange({ ...profileForm, gender: 'male' })}
                  className={`py-3 rounded-xl font-medium transition-colors ${
                    profileForm.gender === 'male'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  남성
                </button>
                <button
                  type="button"
                  onClick={() => onFormChange({ ...profileForm, gender: 'private' })}
                  className={`py-3 rounded-xl font-medium transition-colors ${
                    profileForm.gender === 'private'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  비공개
                </button>
              </div>
            </div>

            {/* Email (읽기 전용) */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                이메일
              </label>
              <div className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400">
                {userEmail || '이메일 없음'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onSave}
            disabled={profileSaving || profileImageUploading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {profileSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                저장 중...
              </>
            ) : (
              '저장하기'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
