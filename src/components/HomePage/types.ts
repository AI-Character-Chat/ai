export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  order: number;
}

export interface Opening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
}

export interface Author {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
}

export interface Work {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  authorId: string | null;
  author: Author | null;
  characters: { id: string; name: string; profileImage: string | null }[];
  openings: Opening[];
  _count: {
    characters: number;
    openings: number;
    lorebook: number;
    chatSessions: number;
    likes: number;
  };
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  isPinned: boolean;
  likeCount: number;
  isLiked: boolean;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  replies: Comment[];
}
