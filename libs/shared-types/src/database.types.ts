export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  segmentCount: number;
  hasSummary: boolean;
}

export interface SearchResult {
  sessionId: string;
  title: string;
  excerpt: string;
  matchType: 'notes' | 'transcript' | 'title';
  createdAt: number;
}
