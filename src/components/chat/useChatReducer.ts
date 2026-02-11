/**
 * 채팅 상태 관리 (useReducer)
 *
 * ChatView의 17개 useState → 단일 useReducer로 통합
 * 타입 안전한 dispatch로 상태 변경 추적 가능
 */

// ============================================================
// 타입 정의 (ChatView 로컬 타입에서 추출)
// ============================================================

export interface ChatCharacter {
  id: string;
  name: string;
  profileImage: string | null;
}

export interface ChatMessage {
  id: string;
  characterId: string | null;
  content: string;
  messageType: 'dialogue' | 'narrator' | 'user' | 'system';
  createdAt: string;
  character?: ChatCharacter | null;
  generatedImageUrl?: string | null;
}

export interface ChatOpening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
  initialLocation?: string;
  initialTime?: string;
}

export interface ChatWork {
  id: string;
  title: string;
  characters: ChatCharacter[];
  openings: ChatOpening[];
}

export interface ChatSessionData {
  id: string;
  userName: string;
  intimacy: number;
  turnCount: number;
  currentLocation: string;
  currentTime: string;
  presentCharacters: string[];
  recentEvents: string[];
}

export interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

export interface ProAnalysisMetrics {
  analysis: string;
  timeMs: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  status: 'pending' | 'complete' | 'failed';
}

export interface ResponseMetadata {
  model: string;
  thinking: boolean;
  promptTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  cacheHitRate: number;
  finishReason: string;
  geminiApiMs: number;
  narrativeMemoryMs: number;
  promptBuildMs: number;
  totalMs: number;
  turnsCount: number;
  systemInstructionLength: number;
  proAnalysis: string;
  proAnalysisMetrics?: ProAnalysisMetrics;
}

// ============================================================
// 상태
// ============================================================

export interface ChatState {
  // 데이터
  work: ChatWork | null;
  session: ChatSessionData | null;
  messages: ChatMessage[];
  // UI 단계
  phase: 'loading' | 'opening' | 'chat' | 'session-loading';
  sending: boolean;
  inputMessage: string;
  // 페르소나
  personas: Persona[];
  selectedPersona: Persona | null;
  // 기타
  generatingImages: Set<string>;
  chatMenuOpen: boolean;
  responseMetadata: Record<string, ResponseMetadata>;
}

export const initialChatState: ChatState = {
  work: null,
  session: null,
  messages: [],
  phase: 'loading',
  sending: false,
  inputMessage: '',
  personas: [],
  selectedPersona: null,
  generatingImages: new Set(),
  chatMenuOpen: false,
  responseMetadata: {},
};

// ============================================================
// 액션
// ============================================================

export type ChatAction =
  | { type: 'SET_PHASE'; phase: ChatState['phase'] }
  | { type: 'LOAD_WORK'; work: ChatWork }
  | { type: 'LOAD_SESSION'; session: ChatSessionData; messages: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_SESSION'; session: Partial<ChatSessionData> }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_INPUT'; text: string }
  | { type: 'SET_PERSONAS'; personas: Persona[]; selected: Persona | null }
  | { type: 'SET_MENU'; open: boolean }
  | { type: 'ADD_GENERATING_IMAGE'; messageId: string }
  | { type: 'REMOVE_GENERATING_IMAGE'; messageId: string }
  | { type: 'SET_RESPONSE_METADATA'; messageId: string; metadata: ResponseMetadata }
  | { type: 'RESET' };

// ============================================================
// Reducer
// ============================================================

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'LOAD_WORK':
      // 'loading'에서만 'opening'으로 전환, 나머지(session-loading, chat 등)는 유지
      return { ...state, work: action.work, phase: state.phase === 'loading' ? 'opening' : state.phase };

    case 'LOAD_SESSION':
      return {
        ...state,
        session: action.session,
        messages: action.messages,
        phase: 'chat',
        sending: false,
      };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_SESSION':
      return state.session
        ? { ...state, session: { ...state.session, ...action.session } }
        : state;

    case 'SET_SENDING':
      return { ...state, sending: action.sending };

    case 'SET_INPUT':
      return { ...state, inputMessage: action.text };

    case 'SET_PERSONAS':
      return { ...state, personas: action.personas, selectedPersona: action.selected };

    case 'SET_MENU':
      return { ...state, chatMenuOpen: action.open };

    case 'ADD_GENERATING_IMAGE':
      return { ...state, generatingImages: new Set(state.generatingImages).add(action.messageId) };

    case 'REMOVE_GENERATING_IMAGE': {
      const next = new Set(state.generatingImages);
      next.delete(action.messageId);
      return { ...state, generatingImages: next };
    }

    case 'SET_RESPONSE_METADATA':
      return {
        ...state,
        responseMetadata: {
          ...state.responseMetadata,
          [action.messageId]: action.metadata,
        },
      };

    case 'RESET':
      return {
        ...initialChatState,
        personas: state.personas,
        selectedPersona: state.selectedPersona,
      };

    default:
      return state;
  }
}
