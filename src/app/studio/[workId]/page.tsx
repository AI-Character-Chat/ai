'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useLayout } from '@/contexts/LayoutContext';
import StudioPreview, {
  OpeningPreview,
  CharacterPreview,
  LorebookPreview,
} from '@/components/studio/StudioPreview';

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
  relationshipConfig: string;
  characters: Character[];
  openings: Opening[];
  lorebook: LorebookEntry[];
}

// 관계 설정 타입 (relationship-config.ts와 동일)
interface AxisDef {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  negative?: boolean;
}

interface LevelDef {
  key: string;
  label: string;
  minScore: number;
  gates?: Record<string, number>;
  behaviorGuide?: string;
}

interface RelConfig {
  axes: AxisDef[];
  levels: LevelDef[];
  weights: Record<string, number>;
  defaultDeltas?: Record<string, number>;
}

type Tab = 'info' | 'characters' | 'openings' | 'lorebook' | 'worldsetting';

export default function WorkEditorPage() {
  const params = useParams();
  const workId = params.workId as string;
  const router = useRouter();
  const { sidebarOpen, sidebarCollapsed } = useLayout();
  const studioHeaderRef = useRef<HTMLElement>(null);
  const previewColRef = useRef<HTMLDivElement>(null);
  const [studioHeaderHeight, setStudioHeaderHeight] = useState(160);
  const [previewRect, setPreviewRect] = useState({ left: 0, width: 0 });
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
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [worldSetting, setWorldSetting] = useState('');

  // Relationship config
  const [useCustomRelConfig, setUseCustomRelConfig] = useState(false);
  const [relAxes, setRelAxes] = useState<AxisDef[]>([]);
  const [relLevels, setRelLevels] = useState<LevelDef[]>([]);
  const [relWeights, setRelWeights] = useState<Record<string, number>>({});

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

  // Ctrl+S / Cmd+S 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saving) return;
        if (activeTab === 'info') saveWorkInfo();
        else if (activeTab === 'worldsetting') saveWorldSetting();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, saving, title, description, tags, visibility, targetAudience, worldSetting, useCustomRelConfig, relAxes, relLevels, relWeights]);

  // 스튜디오 헤더 높이 동적 측정
  useEffect(() => {
    const header = studioHeaderRef.current;
    if (!header) return;
    const measure = () => setStudioHeaderHeight(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // 사이드바 마진 (GlobalLayout과 동일 로직)
  const sidebarMargin =
    sidebarOpen && !sidebarCollapsed
      ? 'lg:ml-80'
      : sidebarOpen && sidebarCollapsed
        ? 'lg:ml-16'
        : '';

  // 프리뷰 칼럼 위치 측정 (fixed 포지셔닝용)
  useEffect(() => {
    const col = previewColRef.current;
    if (!col) return;
    const update = () => {
      const rect = col.getBoundingClientRect();
      setPreviewRect({ left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(col);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [sidebarOpen, sidebarCollapsed, loading]);

  // 미리보기 위치 계산: MainHeader(64px) + StudioHeader + 여백
  const previewFixedTop = 64 + studioHeaderHeight + 8;

  // 탭 전환 시 스크롤 초기화
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchWork = async () => {
    try {
      const response = await fetch(`/api/works/${workId}?t=${Date.now()}`);
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
      setThumbnail(data.thumbnail || null);
      setWorldSetting(data.worldSetting || '');
      // 관계 설정 초기화
      if (data.relationshipConfig && data.relationshipConfig !== '{}') {
        try {
          const rc = JSON.parse(data.relationshipConfig) as RelConfig;
          if (rc.axes && rc.levels) {
            setUseCustomRelConfig(true);
            setRelAxes(rc.axes);
            setRelLevels(rc.levels);
            setRelWeights(rc.weights || {});
          }
        } catch { /* 파싱 실패 시 기본 유지 */ }
      }
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
          thumbnail,
        }),
      });
      const updated = await response.json();
      setWork((prev) => (prev ? { ...prev, ...updated, tags: updated.tags } : null));
      // 플로팅 바가 "변경사항 없음"으로 자동 전환
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
      // 관계 설정 JSON 생성
      let relConfigJson = '{}';
      if (useCustomRelConfig && relAxes.length > 0 && relLevels.length >= 2) {
        const config: RelConfig = { axes: relAxes, levels: relLevels, weights: relWeights };
        relConfigJson = JSON.stringify(config);
      }

      const response = await fetch(`/api/works/${workId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldSetting, relationshipConfig: relConfigJson }),
      });
      const updated = await response.json();
      setWork((prev) => (prev ? { ...prev, worldSetting: updated.worldSetting, relationshipConfig: updated.relationshipConfig } : null));
      // 플로팅 바가 "변경사항 없음"으로 자동 전환
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 관계 설정 프리셋 로드
  const loadRelPreset = (presetKey: string) => {
    const presets: Record<string, { axes: AxisDef[]; levels: LevelDef[]; weights: Record<string, number> }> = {
      romance: {
        axes: [
          { key: 'trust', label: '신뢰', description: '약속 이행/위반, 비밀 공유 시 변화', defaultValue: 50 },
          { key: 'affection', label: '호감', description: '따뜻한/차가운 대화 시 변화', defaultValue: 30 },
          { key: 'respect', label: '존경', description: '현명한 조언/무례한 행동 시 변화', defaultValue: 50 },
          { key: 'rivalry', label: '경쟁심', description: '도전적/양보적 발언 시 변화', defaultValue: 10, negative: true },
          { key: 'familiarity', label: '친숙도', description: '대화할 때마다 자연히 증가', defaultValue: 0 },
        ],
        levels: [
          { key: 'stranger', label: '처음 만난 사이', minScore: 0 },
          { key: 'acquaintance', label: '아는 사이', minScore: 20 },
          { key: 'friend', label: '친구', minScore: 40, gates: { familiarity: 15 } },
          { key: 'close_friend', label: '절친한 친구', minScore: 60, gates: { trust: 25, affection: 40, familiarity: 25 } },
          { key: 'intimate', label: '특별한 사이', minScore: 80, gates: { trust: 40, affection: 60, familiarity: 40 } },
        ],
        weights: { affection: 0.35, trust: 0.25, familiarity: 0.25, respect: 0.15, rivalry: -0.10 },
      },
      rpg: {
        axes: [
          { key: 'combat', label: '무력', description: '전투 관련 행동/성과 시 변화', defaultValue: 10 },
          { key: 'intelligence', label: '지력', description: '지적 판단/전략적 사고 시 변화', defaultValue: 10 },
          { key: 'leadership', label: '통솔', description: '리더십/지휘 관련 행동 시 변화', defaultValue: 5 },
          { key: 'governance', label: '내정', description: '행정/관리 관련 활동 시 변화', defaultValue: 5 },
        ],
        levels: [
          { key: 'novice', label: '견습기사', minScore: 0 },
          { key: 'intermediate', label: '중급기사', minScore: 20, gates: { combat: 20 } },
          { key: 'captain', label: '기사단장', minScore: 40, gates: { combat: 40, leadership: 30 } },
          { key: 'general', label: '대장군', minScore: 60, gates: { combat: 60, leadership: 50, intelligence: 40 } },
          { key: 'king', label: '왕', minScore: 80, gates: { combat: 70, leadership: 60, intelligence: 50, governance: 50 } },
        ],
        weights: { combat: 0.30, intelligence: 0.25, leadership: 0.25, governance: 0.20 },
      },
      school: {
        axes: [
          { key: 'academics', label: '학업', description: '공부/시험/과제 관련 성과', defaultValue: 30 },
          { key: 'social', label: '사교', description: '대인관계/인맥 관련 활동', defaultValue: 20 },
          { key: 'athletics', label: '운동', description: '체육/스포츠 관련 활동', defaultValue: 10 },
          { key: 'creativity', label: '창의', description: '예술/창작 관련 활동', defaultValue: 10 },
        ],
        levels: [
          { key: 'freshman', label: '신입생', minScore: 0 },
          { key: 'regular', label: '일반 학생', minScore: 20 },
          { key: 'popular', label: '인기 학생', minScore: 40, gates: { social: 30 } },
          { key: 'star', label: '학교 스타', minScore: 60, gates: { social: 50 } },
          { key: 'president', label: '학생회장', minScore: 80, gates: { academics: 50, social: 60, creativity: 30 } },
        ],
        weights: { academics: 0.30, social: 0.30, athletics: 0.20, creativity: 0.20 },
      },
    };
    const p = presets[presetKey];
    if (p) {
      setRelAxes(p.axes);
      setRelLevels(p.levels);
      setRelWeights(p.weights);
    }
  };

  const addRelAxis = () => {
    if (relAxes.length >= 10) return;
    setRelAxes([...relAxes, { key: '', label: '', description: '', defaultValue: 0 }]);
  };

  const updateRelAxis = (index: number, field: keyof AxisDef, value: string | number | boolean) => {
    const updated = [...relAxes];
    updated[index] = { ...updated[index], [field]: value };
    setRelAxes(updated);
  };

  const removeRelAxis = (index: number) => {
    const removed = relAxes[index];
    setRelAxes(relAxes.filter((_, i) => i !== index));
    // 가중치에서도 제거
    if (removed.key) {
      const w = { ...relWeights };
      delete w[removed.key];
      setRelWeights(w);
    }
  };

  const addRelLevel = () => {
    if (relLevels.length >= 10) return;
    setRelLevels([...relLevels, { key: '', label: '', minScore: 0 }]);
  };

  const updateRelLevel = (index: number, field: string, value: string | number) => {
    const updated = [...relLevels];
    updated[index] = { ...updated[index], [field]: value };
    setRelLevels(updated);
  };

  const removeRelLevel = (index: number) => {
    setRelLevels(relLevels.filter((_, i) => i !== index));
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
      let savedCharacterId: string | null = null;
      const hasImage = !!characterImage;

      if (editingCharacter?.id) {
        // Update
        const res = await fetch(`/api/characters/${editingCharacter.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: characterName,
            prompt: characterPrompt,
            profileImage: characterImage,
          }),
        });
        const data = await res.json();
        savedCharacterId = data.id || editingCharacter.id;
      } else {
        // Create
        const res = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workId,
            name: characterName,
            prompt: characterPrompt,
            profileImage: characterImage,
          }),
        });
        const data = await res.json();
        savedCharacterId = data.id;
      }

      await fetchWork();
      closeCharacterModal();

      // profileImage 없으면 AI로 자동 생성 (fire-and-forget)
      if (!hasImage && savedCharacterId) {
        fetch(`/api/characters/${savedCharacterId}/generate-portrait`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(result => {
            if (result?.imageUrl) {
              // work 데이터 새로고침하여 생성된 이미지 반영
              fetchWork();
            }
          })
          .catch(() => {});
      }
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

  // ─── 변경 감지 (derived state) ───
  const showSaveBar = activeTab === 'info' || activeTab === 'worldsetting';

  const infoChanged = activeTab === 'info' && (
    title !== (work.title ?? '') ||
    description !== (work.description ?? '') ||
    JSON.stringify(tags) !== JSON.stringify(work.tags ?? []) ||
    visibility !== (work.visibility ?? 'private') ||
    targetAudience !== (work.targetAudience ?? 'all') ||
    (thumbnail ?? null) !== (work.thumbnail ?? null)
  );

  const currentRelConfigJson = useCustomRelConfig && relAxes.length > 0 && relLevels.length >= 2
    ? JSON.stringify({ axes: relAxes, levels: relLevels, weights: relWeights })
    : '{}';
  const worldSettingChanged = activeTab === 'worldsetting' && (
    worldSetting !== (work.worldSetting ?? '') ||
    currentRelConfigJson !== (work.relationshipConfig ?? '{}')
  );

  const hasUnsavedChanges = infoChanged || worldSettingChanged;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header ref={studioHeaderRef} className="bg-white dark:bg-gray-800 shadow-sm sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
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

          {/* Tabs with progress indicators */}
          {(() => {
            const tabsWithStatus = [
              { key: 'info', label: '작품 정보', complete: !!(title.trim() && description.trim()), required: true },
              { key: 'worldsetting', label: '상세설정', complete: worldSetting.trim().length > 0, required: true },
              { key: 'characters', label: `캐릭터 (${work.characters.length})`, complete: work.characters.length >= 1, required: true },
              { key: 'openings', label: `오프닝 (${work.openings.length})`, complete: work.openings.length >= 1, required: true },
              { key: 'lorebook', label: `로어북 (${work.lorebook.length})`, complete: true, required: false },
            ];
            const requiredComplete = tabsWithStatus.filter(t => t.required && t.complete).length;
            const requiredTotal = tabsWithStatus.filter(t => t.required).length;
            return (
              <>
                <div className="flex gap-1 mt-4 overflow-x-auto">
                  {tabsWithStatus.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(tab.key as Tab)}
                      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === tab.key
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {tab.label}
                      {tab.required && (
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          tab.complete ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {requiredComplete}/{requiredTotal} 필수 항목 완료
                </p>
              </>
            );
          })()}
        </div>
      </header>

      {/* Content */}
      <main className={`max-w-7xl mx-auto px-4 py-8 ${showSaveBar ? 'pb-24' : ''}`}>
        <div className="lg:grid lg:grid-cols-5 lg:gap-6">
        {/* Editor (left) */}
        <div className="lg:col-span-3">
        {/* 작품 정보 탭 */}
        {activeTab === 'info' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="space-y-6">
              {/* 썸네일 업로드 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  작품 썸네일
                </label>
                <div className="flex items-start gap-4">
                  <div className="w-32 h-32 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600">
                    {thumbnail ? (
                      <img src={thumbnail} alt="썸네일" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2">
                      <label className={`px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm ${uploadingThumbnail ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) { alert('파일 크기는 5MB 이하여야 합니다.'); return; }
                            setUploadingThumbnail(true);
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              const res = await fetch('/api/upload', { method: 'POST', body: formData });
                              if (!res.ok) throw new Error();
                              const data = await res.json();
                              setThumbnail(data.url);
                            } catch { alert('업로드에 실패했습니다.'); } finally { setUploadingThumbnail(false); }
                          }}
                          disabled={uploadingThumbnail}
                          className="hidden"
                        />
                        {uploadingThumbnail ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            업로드 중...
                          </span>
                        ) : '이미지 선택'}
                      </label>
                      {thumbnail && (
                        <button
                          type="button"
                          onClick={() => setThumbnail(null)}
                          className="px-4 py-2 text-sm text-red-600 border border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      JPG, PNG, GIF, WebP (최대 5MB) · 정사각형 권장
                    </p>
                  </div>
                </div>
              </div>

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

              {/* 관계 진행 시스템 */}
              <div className="border-t pt-6">
                <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  관계 진행 시스템
                </h3>

                {/* 기본/커스텀 토글 */}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => setUseCustomRelConfig(false)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !useCustomRelConfig
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    기본 (연애)
                  </button>
                  <button
                    onClick={() => {
                      setUseCustomRelConfig(true);
                      if (relAxes.length === 0) loadRelPreset('romance');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      useCustomRelConfig
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    커스텀
                  </button>
                </div>

                {!useCustomRelConfig && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      캐릭터의 마음이 열리는 과정을 직접 설계하세요.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      관계 진행 시스템은 캐릭터가 유저와의 대화 속에서 느끼는 5가지 감정(축)을 합산하여, 현재의 관계 레벨을 결정합니다. 점수가 높아질수록 캐릭터의 대사와 태도가 더욱 특별하게 변합니다.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      기본 연애 시스템: 신뢰 / 호감 / 존경 / 경쟁심 / 친숙도
                      <br />레벨: 처음 만난 사이 → 아는 사이 → 친구 → 절친한 친구 → 특별한 사이
                    </p>
                  </div>
                )}

                {useCustomRelConfig && (
                  <div className="space-y-6">
                    {/* 프리셋 템플릿 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        템플릿 불러오기
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { key: 'romance', label: '연애' },
                          { key: 'rpg', label: 'RPG/성장' },
                          { key: 'school', label: '학원' },
                        ].map(preset => (
                          <button
                            key={preset.key}
                            onClick={() => loadRelPreset(preset.key)}
                            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 능력치(축) 설정 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          능력치 (축) 설정
                        </label>
                        <span className="text-xs text-gray-500">{relAxes.length}/10</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        캐릭터가 유저를 평가하는 감정 기준입니다. 이름과 설명을 자유롭게 정하세요.
                      </p>
                      <div className="space-y-2">
                        {relAxes.map((axis, i) => (
                          <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <input
                              type="text"
                              value={axis.key}
                              onChange={(e) => {
                                const oldKey = axis.key;
                                const newKey = e.target.value.replace(/[^a-zA-Z_]/g, '');
                                updateRelAxis(i, 'key', newKey);
                                // 가중치 key도 업데이트
                                if (oldKey && relWeights[oldKey] !== undefined) {
                                  const w = { ...relWeights };
                                  w[newKey] = w[oldKey];
                                  delete w[oldKey];
                                  setRelWeights(w);
                                }
                              }}
                              placeholder="key (영문)"
                              className="w-24 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <input
                              type="text"
                              value={axis.label}
                              onChange={(e) => updateRelAxis(i, 'label', e.target.value)}
                              placeholder="표시명"
                              className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <input
                              type="text"
                              value={axis.description}
                              onChange={(e) => updateRelAxis(i, 'description', e.target.value)}
                              placeholder="설명 (변화 조건)"
                              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <input
                              type="number"
                              value={axis.defaultValue}
                              onChange={(e) => updateRelAxis(i, 'defaultValue', Math.max(0, Math.min(100, Number(e.target.value))))}
                              min={0}
                              max={100}
                              className="w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
                            />
                            <button
                              onClick={() => removeRelAxis(i)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {relAxes.length < 10 && (
                        <button
                          onClick={addRelAxis}
                          className="mt-2 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          + 축 추가
                        </button>
                      )}
                    </div>

                    {/* 레벨 설정 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          레벨 설정 (낮음 → 높음)
                        </label>
                        <span className="text-xs text-gray-500">{relLevels.length}/10</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        관계가 깊어질 때 불릴 호칭과 필요한 최소 점수를 정합니다. 레벨이 높을수록 대사가 친밀해집니다.
                      </p>
                      <div className="space-y-2">
                        {relLevels.map((level, i) => (
                          <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <span className="text-xs text-gray-400 w-8">Lv{i + 1}</span>
                            <input
                              type="text"
                              value={level.key}
                              onChange={(e) => updateRelLevel(i, 'key', e.target.value.replace(/[^a-zA-Z_]/g, ''))}
                              placeholder="key (영문)"
                              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <input
                              type="text"
                              value={level.label}
                              onChange={(e) => updateRelLevel(i, 'label', e.target.value)}
                              placeholder="표시명"
                              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">최소점수:</span>
                              <input
                                type="number"
                                value={level.minScore}
                                onChange={(e) => updateRelLevel(i, 'minScore', Math.max(0, Math.min(100, Number(e.target.value))))}
                                min={0}
                                max={100}
                                className="w-14 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
                              />
                            </div>
                            <button
                              onClick={() => removeRelLevel(i)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              disabled={relLevels.length <= 2}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {relLevels.length < 10 && (
                        <button
                          onClick={addRelLevel}
                          className="mt-2 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          + 레벨 추가
                        </button>
                      )}
                    </div>

                    {/* 가중치 설정 */}
                    {relAxes.filter(a => a.key).length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          가중치 (점수 계산)
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          관계 레벨을 결정할 때 어떤 감정을 더 중요하게 반영할지 비중을 정합니다. (합계 1.0 권장)
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-3">
                          {relAxes.filter(a => a.key).map((axis) => (
                            <div key={axis.key} className="flex items-center gap-3">
                              <span className="text-sm text-gray-700 dark:text-gray-300 w-16">{axis.label || axis.key}</span>
                              <input
                                type="range"
                                min={-0.5}
                                max={0.5}
                                step={0.05}
                                value={relWeights[axis.key] ?? 0.25}
                                onChange={(e) => setRelWeights({ ...relWeights, [axis.key]: Number(e.target.value) })}
                                className="flex-1"
                              />
                              <span className="text-sm text-gray-500 w-12 text-right">
                                {(relWeights[axis.key] ?? 0.25).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <div className="text-xs text-gray-500 text-right">
                            합계: {Object.values(relWeights).reduce((s, v) => s + v, 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                    onClick={() => openCharacterModal(character)}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm flex items-start gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
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
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCharacter(character.id); }}
                      className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      삭제
                    </button>
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
                    onClick={() => openOpeningModal(opening)}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOpening(opening.id); }}
                        className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
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
                    onClick={() => openLorebookModal(entry)}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteLorebook(entry.id); }}
                        className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
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
        </div>{/* end editor col */}

        {/* Preview column placeholder (그리드 레이아웃 유지용) */}
        <div ref={previewColRef} className="hidden lg:block lg:col-span-2" />
        </div>{/* end grid */}
      </main>

      {/* Fixed Preview Panel (스크롤과 무관하게 항상 고정) */}
      {previewRect.width > 0 && (
        <div
          className="hidden lg:block fixed z-10"
          style={{
            top: `${previewFixedTop}px`,
            left: `${previewRect.left}px`,
            width: `${previewRect.width}px`,
          }}
        >
          <StudioPreview
            activeTab={activeTab}
            title={title}
            description={description}
            tags={tags}
            worldSetting={worldSetting}
            characters={work.characters}
            openings={work.openings}
            lorebook={work.lorebook}
            thumbnail={thumbnail}
            useCustomRelConfig={useCustomRelConfig}
            maxHeight={`calc(100vh - ${previewFixedTop + 8}px)`}
          />
        </div>
      )}

      {/* Character Modal */}
      {editingCharacter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl lg:max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingCharacter.id ? '캐릭터 편집' : '새 캐릭터'}
              </h2>
              <div className="lg:grid lg:grid-cols-2 lg:gap-6">
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
              {/* Character Preview */}
              <div className="hidden lg:block mt-4 lg:mt-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">실시간 미리보기</p>
                <CharacterPreview
                  name={characterName}
                  image={characterImage}
                  prompt={characterPrompt}
                />
              </div>
              </div>{/* end grid */}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl lg:max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingOpening.id ? '오프닝 편집' : '새 오프닝'}
              </h2>
              <div className="lg:grid lg:grid-cols-2 lg:gap-6">
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
              {/* Opening Preview */}
              <div className="hidden lg:block mt-4 lg:mt-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">실시간 채팅 미리보기</p>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 max-h-[60vh] overflow-y-auto">
                  <OpeningPreview
                    content={openingContent}
                    characterNames={work.characters.map(c => c.name)}
                  />
                </div>
              </div>
              </div>{/* end grid */}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl lg:max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingLorebook.id ? '로어 편집' : '새 로어'}
              </h2>
              <div className="lg:grid lg:grid-cols-2 lg:gap-6">
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
              {/* Lorebook Preview */}
              <div className="hidden lg:block mt-4 lg:mt-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">실시간 미리보기</p>
                <LorebookPreview
                  name={lorebookName}
                  keywords={lorebookKeywords.split(',').map(k => k.trim()).filter(Boolean)}
                  content={lorebookContent}
                />
              </div>
              </div>{/* end grid */}
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

      {/* Floating Save Bar */}
      {showSaveBar && (
        <div className={`fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-all duration-300 ${sidebarMargin}`}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className={`text-sm ${hasUnsavedChanges ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {hasUnsavedChanges ? '저장하지 않은 변경사항이 있습니다' : '변경사항 없음'}
            </span>
            <button
              onClick={activeTab === 'info' ? saveWorkInfo : saveWorldSetting}
              disabled={saving || !hasUnsavedChanges}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  저장 중...
                </>
              ) : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
