'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ProfileForm {
  nickname: string;
  bio: string;
  birthDate: string;
  gender: 'male' | 'female' | 'private';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useProfile(session: any) {
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    nickname: '',
    bio: '',
    birthDate: '',
    gender: 'private',
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  // 프로필 폼 초기화 - API에서 데이터 가져오기
  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user) {
        try {
          const response = await fetch('/api/user/profile');
          if (response.ok) {
            const data = await response.json();
            setProfileForm({
              nickname: data.name || '',
              bio: data.bio || '',
              birthDate: data.birthDate ? data.birthDate.split('T')[0] : '',
              gender: data.gender || 'private',
            });
            setProfileImage(data.image || null);
          } else {
            setProfileForm((prev) => ({
              ...prev,
              nickname: session.user?.name || '',
            }));
            setProfileImage(session.user?.image || null);
          }
        } catch (error) {
          console.error('Failed to fetch profile:', error);
          setProfileForm((prev) => ({
            ...prev,
            nickname: session.user?.name || '',
          }));
          setProfileImage(session.user?.image || null);
        }
      }
    };
    fetchProfile();
  }, [session]);

  // 프로필 이미지 업로드 핸들러
  const handleProfileImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setProfileImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setProfileImage(data.url);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setProfileImageUploading(false);
    }
  }, []);

  // 프로필 저장 핸들러
  const handleSaveProfile = useCallback(async (onSuccess?: () => void) => {
    setProfileSaving(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileForm.nickname,
          image: profileImage,
          bio: profileForm.bio,
          birthDate: profileForm.birthDate || null,
          gender: profileForm.gender,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Profile save error:', errorData);
        throw new Error(errorData.error || 'Save failed');
      }

      onSuccess?.();

      // 프로필 정보 다시 로드
      const profileResponse = await fetch('/api/user/profile');
      if (profileResponse.ok) {
        const data = await profileResponse.json();
        setProfileForm({
          nickname: data.name || '',
          bio: data.bio || '',
          birthDate: data.birthDate ? data.birthDate.split('T')[0] : '',
          gender: data.gender || 'private',
        });
        setProfileImage(data.image || null);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('프로필 저장에 실패했습니다.');
    } finally {
      setProfileSaving(false);
    }
  }, [profileForm, profileImage]);

  return {
    profileForm,
    setProfileForm,
    profileImage,
    profileSaving,
    profileImageUploading,
    profileImageInputRef,
    handleProfileImageChange,
    handleSaveProfile,
  };
}
