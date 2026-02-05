// TypeScript 타입 정의

export interface Work {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  targetAudience: 'all' | 'male' | 'female';
  visibility: 'public' | 'private' | 'unlisted';
  isAdult: boolean;
  createdAt: Date;
  updatedAt: Date;
  characters?: Character[];
  openings?: Opening[];
  lorebook?: LorebookEntry[];
}

export interface Character {
  id: string;
  workId: string;
  name: string;
  profileImage: string | null;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GalleryImage {
  id: string;
  workId: string;
  characterName: string | null;
  keyword: string;
  imageUrl: string;
  description: string | null;
  createdAt: Date;
}

export interface LorebookEntry {
  id: string;
  workId: string;
  name: string;
  keywords: string[];
  content: string;
  priority: number;
  minIntimacy: number | null;
  minTurns: number | null;
  requiredCharacter: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Opening {
  id: string;
  workId: string;
  title: string;
  content: string;
  isDefault: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSession {
  id: string;
  workId: string;
  userName: string;
  intimacy: number;
  turnCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export interface Message {
  id: string;
  sessionId: string;
  characterId: string | null;
  content: string;
  createdAt: Date;
  character?: Character | null;
}

// API Request/Response types
export interface CreateWorkRequest {
  title: string;
  description: string;
  thumbnail?: string;
  tags?: string[];
  targetAudience?: 'all' | 'male' | 'female';
  visibility?: 'public' | 'private' | 'unlisted';
  isAdult?: boolean;
}

export interface CreateCharacterRequest {
  workId: string;
  name: string;
  profileImage?: string;
  prompt: string;
}

export interface CreateOpeningRequest {
  workId: string;
  title: string;
  content: string;
  isDefault?: boolean;
  order?: number;
}

export interface CreateLorebookRequest {
  workId: string;
  name: string;
  keywords: string[];
  content: string;
  priority?: number;
  minIntimacy?: number;
  minTurns?: number;
  requiredCharacter?: string;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;
}

export interface ChatResponse {
  userMessage: Message;
  characterResponses: Message[];
  session: ChatSession;
}

// 멀티 캐릭터 대화를 위한 타입
export interface ChatContext {
  session: ChatSession;
  characters: Character[];
  activeLorebookEntries: LorebookEntry[];
  recentMessages: Message[];
}

export interface CharacterResponse {
  characterId: string;
  characterName: string;
  content: string;
}
