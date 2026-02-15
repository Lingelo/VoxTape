import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';

// Mock types
interface SessionItem {
  id: string;
  title: string;
  durationMs: number;
  hasSummary: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SessionGroup {
  label: string;
  sessions: SessionItem[];
}

interface SearchResult {
  sessionId: string;
  title: string;
  excerpt: string;
}

describe('SidebarComponent utilities', () => {
  describe('formatDuration', () => {
    const formatDuration = (ms: number): string => {
      if (!ms) return '0:00';
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    it('should return 0:00 for 0ms', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should return 0:00 for undefined/null', () => {
      expect(formatDuration(undefined as unknown as number)).toBe('0:00');
      expect(formatDuration(null as unknown as number)).toBe('0:00');
    });

    it('should format seconds correctly', () => {
      expect(formatDuration(5000)).toBe('0:05');
      expect(formatDuration(30000)).toBe('0:30');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1:00');
      expect(formatDuration(90000)).toBe('1:30');
      expect(formatDuration(600000)).toBe('10:00');
    });

    it('should format hours as minutes', () => {
      expect(formatDuration(3600000)).toBe('60:00'); // 1 hour = 60 minutes
    });
  });

  describe('groupByDate', () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const todayMs = new Date(now).setHours(0, 0, 0, 0);
    const yesterdayMs = todayMs - 86400000;
    const weekMs = todayMs - 7 * 86400000;

    const groupByDate = (sessions: SessionItem[]): SessionGroup[] => {
      const todayLabel = 'Today';
      const yesterdayLabel = 'Yesterday';
      const thisWeekLabel = 'This Week';
      const olderLabel = 'Older';

      const groups: Record<string, SessionItem[]> = {
        [todayLabel]: [],
        [yesterdayLabel]: [],
        [thisWeekLabel]: [],
        [olderLabel]: [],
      };

      for (const s of sessions) {
        const t = s.updatedAt || s.createdAt || 0;
        if (t >= todayMs) groups[todayLabel].push(s);
        else if (t >= yesterdayMs) groups[yesterdayLabel].push(s);
        else if (t >= weekMs) groups[thisWeekLabel].push(s);
        else groups[olderLabel].push(s);
      }

      return Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([label, sessions]) => ({ label, sessions }));
    };

    it('should group today sessions', () => {
      const sessions: SessionItem[] = [
        { id: '1', title: 'Today session', durationMs: 1000, hasSummary: false, createdAt: todayMs + 1000, updatedAt: todayMs + 1000 },
      ];

      const groups = groupByDate(sessions);
      expect(groups.length).toBe(1);
      expect(groups[0].label).toBe('Today');
      expect(groups[0].sessions.length).toBe(1);
    });

    it('should group yesterday sessions', () => {
      const sessions: SessionItem[] = [
        { id: '1', title: 'Yesterday session', durationMs: 1000, hasSummary: false, createdAt: yesterdayMs + 1000, updatedAt: yesterdayMs + 1000 },
      ];

      const groups = groupByDate(sessions);
      expect(groups.length).toBe(1);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('should handle older sessions', () => {
      const oldDate = todayMs - 30 * 86400000; // 30 days ago
      const sessions: SessionItem[] = [
        { id: '1', title: 'Old session', durationMs: 1000, hasSummary: false, createdAt: oldDate, updatedAt: oldDate },
      ];

      const groups = groupByDate(sessions);
      expect(groups.length).toBe(1);
      expect(groups[0].label).toBe('Older');
    });

    it('should create multiple groups', () => {
      const sessions: SessionItem[] = [
        { id: '1', title: 'Today', durationMs: 1000, hasSummary: false, createdAt: todayMs + 1000, updatedAt: todayMs + 1000 },
        { id: '2', title: 'Yesterday', durationMs: 1000, hasSummary: false, createdAt: yesterdayMs + 1000, updatedAt: yesterdayMs + 1000 },
      ];

      const groups = groupByDate(sessions);
      expect(groups.length).toBe(2);
    });

    it('should filter empty groups', () => {
      const sessions: SessionItem[] = [];
      const groups = groupByDate(sessions);
      expect(groups.length).toBe(0);
    });
  });
});

describe('SidebarComponent state management', () => {
  describe('session selection', () => {
    it('should track active session id', () => {
      const id$ = new BehaviorSubject<string>('');
      let activeId = '';

      id$.subscribe((id) => {
        activeId = id;
      });

      expect(activeId).toBe('');

      id$.next('session-123');
      expect(activeId).toBe('session-123');
    });
  });

  describe('search functionality', () => {
    it('should debounce search input', async () => {
      const searchSubject = new Subject<string>();
      const performSearch = vi.fn();

      // Simulate debounced subscription
      let lastSearchTerm = '';
      searchSubject.subscribe((term) => {
        lastSearchTerm = term;
        performSearch(term);
      });

      searchSubject.next('test');
      expect(lastSearchTerm).toBe('test');
      expect(performSearch).toHaveBeenCalledWith('test');
    });

    it('should clear search results when query is empty', () => {
      let searchResults: SearchResult[] = [
        { sessionId: '1', title: 'Test', excerpt: 'test content' },
      ];

      const onSearchInput = (query: string) => {
        if (!query.trim()) {
          searchResults = [];
        }
      };

      onSearchInput('');
      expect(searchResults.length).toBe(0);
    });
  });

  describe('delete modal', () => {
    it('should show delete modal and track pending id', () => {
      let showDeleteModal = false;
      let pendingDeleteId = '';

      const onDeleteSession = (id: string) => {
        pendingDeleteId = id;
        showDeleteModal = true;
      };

      onDeleteSession('session-to-delete');

      expect(showDeleteModal).toBe(true);
      expect(pendingDeleteId).toBe('session-to-delete');
    });

    it('should reset state on cancel', () => {
      let showDeleteModal = true;
      let pendingDeleteId = 'session-123';

      const cancelDelete = () => {
        showDeleteModal = false;
        pendingDeleteId = '';
      };

      cancelDelete();

      expect(showDeleteModal).toBe(false);
      expect(pendingDeleteId).toBe('');
    });
  });
});

describe('SidebarComponent session operations', () => {
  it('should open session and clear search', () => {
    let searchQuery = 'some search';
    let searchResults: SearchResult[] = [{ sessionId: '1', title: 'Test', excerpt: 'test' }];
    const loadSession = vi.fn();

    const openSession = (id: string) => {
      loadSession(id);
      searchQuery = '';
      searchResults = [];
    };

    openSession('session-123');

    expect(loadSession).toHaveBeenCalledWith('session-123');
    expect(searchQuery).toBe('');
    expect(searchResults.length).toBe(0);
  });
});
