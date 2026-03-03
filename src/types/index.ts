// TypeScript 타입 정의

export interface Work {
  id: string;
  authorId: string | null;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[]; // DB에는 JSON 문자열로 저장 (String @default("[]"))
  targetAudience: 'all' | 'male' | 'female';
  visibility: 'public' | 'private' | 'unlisted';
  isAdult: boolean;
  worldSetting: string;
  relationshipConfig: string; // JSON 문자열
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
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
  userId: string | null;
  userName: string;
  intimacy: number;
  turnCount: number;
  currentLocation: string;
  currentTime: string;
  presentCharacters: string; // JSON 문자열 (String[])
  recentEvents: string; // JSON 문자열 (String[])
  userProfile: string; // JSON 문자열
  sessionSummary: string;
  relationshipStage: string;
  characterMemories: string; // JSON 문자열
  userPersona: string; // JSON 문자열
  proAnalysis: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export interface Message {
  id: string;
  sessionId: string;
  characterId: string | null;
  content: string;
  messageType: string; // "dialogue" | "narrator" | "user" | "system"
  imageUrl: string | null;
  metadata: string | null; // JSON 문자열
  embedding: string; // JSON 문자열 (Float[])
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
