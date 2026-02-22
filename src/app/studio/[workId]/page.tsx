'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

interface Character {
  id: string;
  name: string;
  profileImage: string | null;
  prompt: string;
}

interface Opening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
  order: number;
  initialLocation?: string;
  initialTime?: string;
}

interface LorebookEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  priority: number;
  minIntimacy: number | null;
  minTurns: number | null;
  requiredCharacter: string | null;
}

interface Work {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  targetAudience: string;
  visibility: string;
  isAdult: boolean;
  worldSetting: string;
  characters: Character[];
  openings: Opening[];
  lorebook: LorebookEntry[];
}

type Tab = 'info' | 'characters' | 'openings' | 'lorebook' | 'worldsetting';

export default function WorkEditorPage() {
  const params = useParams();
  const workId = params.workId as string;
  const router = useRouter();
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [targetAudience, setTargetAudience] = useState('all');
  const [worldSetting, setWorldSetting] = useState('');

  // Character edit modal
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterName, setCharacterName] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Opening edit modal
  const [editingOpening, setEditingOpening] = useState<Opening | null>(null);
  const [openingTitle, setOpeningTitle] = useState('');
  const [openingContent, setOpeningContent] = useState('');
  const [openingIsDefault, setOpeningIsDefault] = useState(false);
  const [openingLocation, setOpeningLocation] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  // Lorebook edit modal
  const [editingLorebook, setEditingLorebook] = useState<LorebookEntry | null>(null);
  const [lorebookName, setLorebookName] = useState('');
  const [lorebookKeywords, setLorebookKeywords] = useState('');
  const [lorebookContent, setLorebookContent] = useState('');
  const [lorebookMinIntimacy, setLorebookMinIntimacy] = useState('');
  const [lorebookMinTurns, setLorebookMinTurns] = useState('');

  useEffect(() => {
    fetchWork();
  }, [workId]);

  const fetchWork = async () => {
    try {
      const response = await fetch(`/api/works/${workId}`);
      if (!response.ok) {
        router.push('/studio');
        return;
      }
      const data = await response.json();
      setWork(data);
      setTitle(data.title);
      setDescription(data.description);
      setTags(data.tags);
      setVisibility(data.visibility);
      setTargetAudience(data.targetAudience);
      setWorldSetting(data.worldSetting || '');
    } catch (error) {
      console.error('Failed to fetch work:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWorkInfo = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/works/${workId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          tags,
          visibility,
          targetAudience,
        }),
      });
      const updated = await response.json();
      setWork((prev) => (prev ? { ...prev, ...updated, tags: updated.tags } : null));
      alert('저장되었습니다.');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && tags.length < 10) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const saveWorldSetting = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/works/${workId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldSetting }),
      });
      const updated = await response.json();
      setWork((prev) => (prev ? { ...prev, worldSetting: updated.worldSetting } : null));
      alert('저장되었습니다.');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // Character functions
  const openCharacterModal = (character?: Character) => {
    if (character) {
      setEditingCharacter(character);
      setCharacterName(character.name);
      setCharacterPrompt(character.prompt);
      setCharacterImage(character.profileImage);
    } else {
      setEditingCharacter({ id: '', name: '', profileImage: null, prompt: '' });
      setCharacterName('');
      setCharacterPrompt('');
      setCharacterImage(null);
    }
  };

  const closeCharacterModal = () => {
    setEditingCharacter(null);
    setCharacterImage(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 타입 검증
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('허용되지 않는 파일 형식입니다. (jpg, png, gif, webp만 허용)');
      return;
    }

    // 파일 크기 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '업로드 실패');
      }

      const data = await response.json();
      setCharacterImage(data.url);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeCharacterImage = () => {
    setCharacterImage(null);
  };

  const saveCharacter = async () => {
    if (!characterName.trim() || !characterPrompt.trim()) {
      alert('이름과 프롬프트를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editingCharacter?.id) {
        // Update
        await fetch(`/api/characters/${editingCharacter.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: characterName,
            prompt: characterPrompt,
            profileImage: characterImage,
          }),
        });
      } else {
        // Create
        await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workId,
            name: characterName,
            prompt: characterPrompt,
            profileImage: characterImage,
          }),
        });
      }
      await fetchWork();
      closeCharacterModal();
    } catch (error) {
      console.error('Failed to save character:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCharacter = async (characterId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/characters/${characterId}`, { method: 'DELETE' });
      await fetchWork();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Opening functions
  const openOpeningModal = (opening?: Opening) => {
    if (opening) {
      setEditingOpening(opening);
      setOpeningTitle(opening.title);
      setOpeningContent(opening.content);
      setOpeningIsDefault(opening.isDefault);
      setOpeningLocation(opening.initialLocation || '');
      setOpeningTime(opening.initialTime || '');
    } else {
      setEditingOpening({ id: '', title: '', content: '', isDefault: false, order: 0 });
      setOpeningTitle('');
      setOpeningContent('');
      setOpeningIsDefault(false);
      setOpeningLocation('');
      setOpeningTime('');
    }
  };

  const closeOpeningModal = () => {
    setEditingOpening(null);
  };

  const saveOpening = async () => {
    if (!openingTitle.trim() || !openingContent.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    if (!openingLocation.trim() || !openingTime.trim()) {
      alert('초기 장소와 시간을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editingOpening?.id) {
        await fetch(`/api/openings/${editingOpening.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingOpening.id,
            title: openingTitle,
            content: openingContent,
            isDefault: openingIsDefault,
            initialLocation: openingLocation,
            initialTime: openingTime,
          }),
        });
      } else {
        await fetch('/api/openings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workId,
            title: openingTitle,
            content: openingContent,
            isDefault: openingIsDefault,
            initialLocation: openingLocation,
            initialTime: openingTime,
          }),
        });
      }
      await fetchWork();
      closeOpeningModal();
    } catch (error) {
      console.error('Failed to save opening:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteOpening = async (openingId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/openings/${openingId}`, { method: 'DELETE' });
      await fetchWork();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Lorebook functions
  const openLorebookModal = (entry?: LorebookEntry) => {
    if (entry) {
      setEditingLorebook(entry);
      setLorebookName(entry.name);
      setLorebookKeywords(entry.keywords.join(', '));
      setLorebookContent(entry.content);
      setLorebookMinIntimacy(entry.minIntimacy?.toString() || '');
      setLorebookMinTurns(entry.minTurns?.toString() || '');
    } else {
      setEditingLorebook({
        id: '',
        name: '',
        keywords: [],
        content: '',
        priority: 0,
        minIntimacy: null,
        minTurns: null,
        requiredCharacter: null,
      });
      setLorebookName('');
      setLorebookKeywords('');
      setLorebookContent('');
      setLorebookMinIntimacy('');
      setLorebookMinTurns('');
    }
  };

  const closeLorebookModal = () => {
    setEditingLorebook(null);
  };

  const saveLorebook = async () => {
    if (!lorebookName.trim() || !lorebookKeywords.trim() || !lorebookContent.trim()) {
      alert('이름, 키워드, 내용을 입력해주세요.');
      return;
    }

    const keywords = lorebookKeywords.split(',').map((k) => k.trim()).filter(Boolean);

    setSaving(true);
    try {
      if (editingLorebook?.id) {
        await fetch(`/api/lorebook/${editingLorebook.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: lorebookName,
            keywords,
            content: lorebookContent,
            minIntimacy: lorebookMinIntimacy ? parseFloat(lorebookMinIntimacy) : null,
            minTurns: lorebookMinTurns ? parseInt(lorebookMinTurns) : null,
          }),
        });
      } else {
        await fetch('/api/lorebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workId,
            name: lorebookName,
            keywords,
            content: lorebookContent,
            minIntimacy: lorebookMinIntimacy ? parseFloat(lorebookMinIntimacy) : null,
            minTurns: lorebookMinTurns ? parseInt(lorebookMinTurns) : null,
          }),
        });
      }
      await fetchWork();
      closeLorebookModal();
    } catch (error) {
      console.error('Failed to save lorebook:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteLorebook = async (entryId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/lorebook/${entryId}`, { method: 'DELETE' });
      await fetchWork();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">로딩 중...</div>
      </div>
    );
  }

  if (!work) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/studio"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {work.title}
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/chat/${workId}`}
                className="px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              >
                미리보기
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {[
              { key: 'info', label: '작품 정보' },
              { key: 'worldsetting', label: '상세설정' },
              { key: 'characters', label: `캐릭터 (${work.characters.length})` },
              { key: 'openings', label: `오프닝 (${work.openings.length})` },
              { key: 'lorebook', label: `로어북 (${work.lorebook.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as Tab)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* 작품 정보 탭 */}
        {activeTab === 'info' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  작품 제목 *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={50}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">{title.length}/50자</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  작품 소개 *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">{description.length}/500자</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  태그 (최대 10개)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center gap-1"
                    >
                      #{tag}
                      <button
                        onClick={() => removeTag(index)}
                        className="text-gray-500 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                    placeholder="태그 입력 후 Enter"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    추가
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    타겟 유저
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  >
                    <option value="all">전체</option>
                    <option value="male">남성향</option>
                    <option value="female">여성향</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    공개 설정
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  >
                    <option value="private">비공개</option>
                    <option value="unlisted">링크 공유만</option>
                    <option value="public">공개</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t">
                <button
                  onClick={saveWorkInfo}
                  disabled={saving}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 상세설정 탭 */}
        {activeTab === 'worldsetting' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    세계관 및 배경 설정
                  </label>
                  <span className="text-xs text-gray-500">{worldSetting.length}/10,000자</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  이 설정은 모든 대화에 항상 적용됩니다. 세계관, 캐릭터 관계도, 전체적인 배경을 작성하세요.
                </p>
                <textarea
                  value={worldSetting}
                  onChange={(e) => setWorldSetting(e.target.value)}
                  maxLength={10000}
                  rows={20}
                  placeholder={`## 세계관
이 이야기는 현대 한국의 서울을 배경으로 합니다. 마법이나 초자연적 요소는 존재하지 않습니다.

## 캐릭터 관계도
- 아셀과 리나: 같은 대학 동아리 선후배 사이. 서로 호감이 있지만 표현하지 못함.
- 유저와 아셀: 같은 과 동기. 1학년 때부터 친한 친구.
- 유저와 리나: 동아리에서 처음 만남. 아직 서먹한 사이.

## 배경 상황
현재 시점은 대학교 2학년 1학기. 기말고사가 일주일 앞으로 다가왔다.
동아리 MT를 준비 중이며, 유저는 MT 총무를 맡게 되었다.

## 규칙 및 제한
- 캐릭터들은 서로 존댓말을 사용합니다 (선후배 관계 제외).
- 유저에게 반말을 쓰는 캐릭터: 아셀 (친구)
- 유저에게 존댓말을 쓰는 캐릭터: 리나 (후배)

## 금기 사항
- 현실에 존재하지 않는 기술이나 마법은 사용하지 않습니다.
- 특정 브랜드명은 언급하지 않습니다.`}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white font-mono text-sm leading-relaxed"
                />
              </div>

              {/* 작성 가이드 */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  작성 가이드
                </h3>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span><strong>세계관:</strong> 시대, 장소, 판타지/현실 여부, 특수한 규칙 등</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span><strong>캐릭터 관계도:</strong> 캐릭터 간의 관계, 유저와의 관계</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span><strong>배경 상황:</strong> 이야기가 시작되는 시점의 상황</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span><strong>규칙:</strong> 대화 시 지켜야 할 규칙 (말투, 호칭 등)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span><strong>금기 사항:</strong> AI가 피해야 할 주제나 행동</span>
                  </li>
                </ul>
              </div>

              {/* 로어북과의 차이 설명 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  상세설정 vs 로어북
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>상세설정</strong>은 모든 대화에 항상 적용되는 기본 정보입니다.<br />
                  <strong>로어북</strong>은 특정 키워드가 언급될 때만 활성화되는 추가 정보입니다.
                </p>
              </div>

              <div className="pt-4 border-t">
                <button
                  onClick={saveWorldSetting}
                  disabled={saving}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 캐릭터 탭 */}
        {activeTab === 'characters' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                최소 1명의 캐릭터가 필요합니다.
              </p>
              <button
                onClick={() => openCharacterModal()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                + 캐릭터 추가
              </button>
            </div>

            {work.characters.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                <p className="text-gray-500">등록된 캐릭터가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {work.characters.map((character) => (
                  <div
                    key={character.id}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm flex items-start gap-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">
                      {character.profileImage ? (
                        <img
                          src={character.profileImage}
                          alt={character.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        character.name[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {character.name}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                        {character.prompt.substring(0, 150)}...
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openCharacterModal(character)}
                        className="px-3 py-1 text-sm text-primary-600 border border-primary-600 rounded hover:bg-primary-50"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => deleteCharacter(character.id)}
                        className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 오프닝 탭 */}
        {activeTab === 'openings' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                최소 1개의 오프닝이 필요합니다.
              </p>
              <button
                onClick={() => openOpeningModal()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                + 오프닝 추가
              </button>
            </div>

            {work.openings.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                <p className="text-gray-500">등록된 오프닝이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {work.openings.map((opening) => (
                  <div
                    key={opening.id}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {opening.title}
                          </h3>
                          {opening.isDefault && (
                            <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                              기본
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                          {opening.content.substring(0, 150)}...
                        </p>
                        {/* 초기 설정 표시 */}
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                            📍 {opening.initialLocation || '미설정'}
                          </span>
                          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                            🕐 {opening.initialTime || '미설정'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openOpeningModal(opening)}
                          className="px-3 py-1 text-sm text-primary-600 border border-primary-600 rounded hover:bg-primary-50"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => deleteOpening(opening.id)}
                          className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 로어북 탭 */}
        {activeTab === 'lorebook' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                대화 중 특정 키워드가 언급되면 자동으로 활성화되는 추가 정보입니다.
              </p>
              <button
                onClick={() => openLorebookModal()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                + 로어 추가
              </button>
            </div>

            {work.lorebook.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                <p className="text-gray-500">등록된 로어북이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {work.lorebook.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          #{index + 1} {entry.name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          키워드: {entry.keywords.join(', ')}
                        </p>
                        {(entry.minIntimacy || entry.minTurns) && (
                          <p className="text-xs text-gray-400 mt-1">
                            조건: {entry.minIntimacy && `친밀도 ${entry.minIntimacy}↑`}
                            {entry.minIntimacy && entry.minTurns && ', '}
                            {entry.minTurns && `${entry.minTurns}턴↑`}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openLorebookModal(entry)}
                          className="px-3 py-1 text-sm text-primary-600 border border-primary-600 rounded hover:bg-primary-50"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => deleteLorebook(entry.id)}
                          className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Character Modal */}
      {editingCharacter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingCharacter.id ? '캐릭터 편집' : '새 캐릭터'}
              </h2>
              <div className="space-y-4">
                {/* 프로필 이미지 업로드 */}
                <div>
                  <label className="block text-sm font-medium mb-2">프로필 이미지</label>
                  <div className="flex items-start gap-4">
                    {/* 이미지 미리보기 */}
                    <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-gray-300 dark:border-gray-600">
                      {characterImage ? (
                        <img
                          src={characterImage}
                          alt="프로필 미리보기"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    {/* 업로드 컨트롤 */}
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2">
                        <label className={`px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                            className="hidden"
                          />
                          {uploadingImage ? (
                            <span className="flex items-center gap-2">
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              업로드 중...
                            </span>
                          ) : (
                            '이미지 선택'
                          )}
                        </label>
                        {characterImage && (
                          <button
                            type="button"
                            onClick={removeCharacterImage}
                            className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        JPG, PNG, GIF, WebP (최대 5MB)
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">캐릭터 이름 *</label>
                  <input
                    type="text"
                    value={characterName}
                    onChange={(e) => setCharacterName(e.target.value)}
                    maxLength={35}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">캐릭터 프롬프트 *</label>
                  <textarea
                    value={characterPrompt}
                    onChange={(e) => setCharacterPrompt(e.target.value)}
                    rows={15}
                    maxLength={16000}
                    placeholder="## 기본 정보&#10;- 이름: &#10;- 나이: &#10;&#10;## 성격&#10;&#10;## 말투&#10;- 예시: "
                    className="w-full px-4 py-2 border rounded-lg font-mono text-sm dark:bg-gray-700 dark:border-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {characterPrompt.length}/16,000자
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={closeCharacterModal}
                  className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={saveCharacter}
                  disabled={saving || uploadingImage}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Opening Modal */}
      {editingOpening && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingOpening.id ? '오프닝 편집' : '새 오프닝'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">제목 *</label>
                  <input
                    type="text"
                    value={openingTitle}
                    onChange={(e) => setOpeningTitle(e.target.value)}
                    maxLength={50}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">내용 *</label>
                  <textarea
                    value={openingContent}
                    onChange={(e) => setOpeningContent(e.target.value)}
                    rows={10}
                    maxLength={5500}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {openingContent.length}/5,500자
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">초기 장소 *</label>
                    <input
                      type="text"
                      value={openingLocation}
                      onChange={(e) => setOpeningLocation(e.target.value)}
                      placeholder="예: 학원 로비, 카페, 공원"
                      maxLength={50}
                      className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">초기 시간 *</label>
                    <input
                      type="text"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      placeholder="예: 오후 3시, 저녁, 새벽"
                      maxLength={30}
                      className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={openingIsDefault}
                    onChange={(e) => setOpeningIsDefault(e.target.checked)}
                  />
                  <label htmlFor="isDefault" className="text-sm">
                    기본 오프닝으로 설정
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={closeOpeningModal}
                  className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={saveOpening}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lorebook Modal */}
      {editingLorebook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingLorebook.id ? '로어 편집' : '새 로어'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">로어 이름 *</label>
                  <input
                    type="text"
                    value={lorebookName}
                    onChange={(e) => setLorebookName(e.target.value)}
                    maxLength={80}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    활성화 키워드 * (쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    value={lorebookKeywords}
                    onChange={(e) => setLorebookKeywords(e.target.value)}
                    placeholder="황인하, 인하 누나, 인하"
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">내용 *</label>
                  <textarea
                    value={lorebookContent}
                    onChange={(e) => setLorebookContent(e.target.value)}
                    rows={8}
                    maxLength={4500}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {lorebookContent.length}/4,500자
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      최소 친밀도 (선택)
                    </label>
                    <input
                      type="number"
                      value={lorebookMinIntimacy}
                      onChange={(e) => setLorebookMinIntimacy(e.target.value)}
                      min="0"
                      max="10"
                      step="0.1"
                      className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      최소 턴 수 (선택)
                    </label>
                    <input
                      type="number"
                      value={lorebookMinTurns}
                      onChange={(e) => setLorebookMinTurns(e.target.value)}
                      min="0"
                      className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={closeLorebookModal}
                  className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={saveLorebook}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
