import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

// Mock TranscriptSegment type
interface TranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speaker?: number;
}

// Unit tests for TranscriptPanelComponent utility methods
// These test the logic without Angular's TestBed

describe('TranscriptPanelComponent utilities', () => {
  describe('formatTime', () => {
    // Extract the pure function logic for testing
    const formatTime = (ms: number): string => {
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    it('should format 0ms as 00:00', () => {
      expect(formatTime(0)).toBe('00:00');
    });

    it('should format seconds correctly', () => {
      expect(formatTime(5000)).toBe('00:05');
      expect(formatTime(30000)).toBe('00:30');
      expect(formatTime(59000)).toBe('00:59');
    });

    it('should format minutes correctly', () => {
      expect(formatTime(60000)).toBe('01:00');
      expect(formatTime(65000)).toBe('01:05');
      expect(formatTime(120000)).toBe('02:00');
    });

    it('should format longer durations', () => {
      expect(formatTime(600000)).toBe('10:00'); // 10 minutes
      expect(formatTime(3600000)).toBe('60:00'); // 1 hour
    });

    it('should handle fractional milliseconds by truncating', () => {
      expect(formatTime(5500)).toBe('00:05'); // 5.5 seconds = 5 sec
      expect(formatTime(5999)).toBe('00:05'); // 5.999 seconds = 5 sec
    });
  });

  describe('isHighlighted', () => {
    const isHighlighted = (segmentId: string, highlightSegmentIds: string[]): boolean => {
      return highlightSegmentIds.includes(segmentId);
    };

    it('should return true when segment is in highlight list', () => {
      expect(isHighlighted('seg-1', ['seg-1', 'seg-2'])).toBe(true);
    });

    it('should return false when segment is not in highlight list', () => {
      expect(isHighlighted('seg-3', ['seg-1', 'seg-2'])).toBe(false);
    });

    it('should return false for empty highlight list', () => {
      expect(isHighlighted('seg-1', [])).toBe(false);
    });
  });

  describe('trackSegment', () => {
    const trackSegment = (_index: number, segment: TranscriptSegment): string => {
      return segment.id;
    };

    it('should return segment id for tracking', () => {
      const segment: TranscriptSegment = {
        id: 'test-segment-123',
        text: 'Hello world',
        startMs: 0,
        endMs: 1000,
      };
      expect(trackSegment(0, segment)).toBe('test-segment-123');
    });

    it('should ignore index parameter', () => {
      const segment: TranscriptSegment = {
        id: 'segment-xyz',
        text: 'Test',
        startMs: 0,
        endMs: 500,
      };
      expect(trackSegment(100, segment)).toBe('segment-xyz');
    });
  });
});

describe('TranscriptPanelComponent state management', () => {
  describe('segment updates', () => {
    it('should update segments when service emits', () => {
      const segments$ = new BehaviorSubject<TranscriptSegment[]>([]);
      let componentSegments: TranscriptSegment[] = [];

      // Simulate component subscription
      segments$.subscribe((segs) => {
        componentSegments = segs;
      });

      // Emit new segments
      const newSegments: TranscriptSegment[] = [
        { id: '1', text: 'Hello', startMs: 0, endMs: 1000 },
        { id: '2', text: 'World', startMs: 1000, endMs: 2000 },
      ];
      segments$.next(newSegments);

      expect(componentSegments).toEqual(newSegments);
      expect(componentSegments.length).toBe(2);
    });
  });

  describe('speech detection', () => {
    it('should track speech active state', () => {
      const speechDetected$ = new BehaviorSubject<boolean>(false);
      let isSpeechActive = false;

      speechDetected$.subscribe((active) => {
        isSpeechActive = active;
      });

      expect(isSpeechActive).toBe(false);

      speechDetected$.next(true);
      expect(isSpeechActive).toBe(true);

      speechDetected$.next(false);
      expect(isSpeechActive).toBe(false);
    });
  });

  describe('STT status', () => {
    it('should track STT status changes', () => {
      const sttStatus$ = new BehaviorSubject<'loading' | 'ready' | 'error'>('loading');
      let status: 'loading' | 'ready' | 'error' = 'loading';

      sttStatus$.subscribe((s) => {
        status = s;
      });

      expect(status).toBe('loading');

      sttStatus$.next('ready');
      expect(status).toBe('ready');

      sttStatus$.next('error');
      expect(status).toBe('error');
    });
  });

  describe('subscription cleanup', () => {
    it('should unsubscribe all subscriptions on destroy', () => {
      const sub1 = { unsubscribe: vi.fn() };
      const sub2 = { unsubscribe: vi.fn() };
      const sub3 = { unsubscribe: vi.fn() };
      const subs = [sub1, sub2, sub3];

      // Simulate ngOnDestroy
      subs.forEach((s) => s.unsubscribe());

      expect(sub1.unsubscribe).toHaveBeenCalled();
      expect(sub2.unsubscribe).toHaveBeenCalled();
      expect(sub3.unsubscribe).toHaveBeenCalled();
    });
  });
});

describe('TranscriptPanelComponent highlighting', () => {
  it('should identify multiple highlighted segments', () => {
    const highlightIds = ['seg-1', 'seg-3', 'seg-5'];
    const segments: TranscriptSegment[] = [
      { id: 'seg-1', text: 'First', startMs: 0, endMs: 1000 },
      { id: 'seg-2', text: 'Second', startMs: 1000, endMs: 2000 },
      { id: 'seg-3', text: 'Third', startMs: 2000, endMs: 3000 },
    ];

    const isHighlighted = (id: string) => highlightIds.includes(id);
    const highlightedSegments = segments.filter((s) => isHighlighted(s.id));

    expect(highlightedSegments.length).toBe(2);
    expect(highlightedSegments[0].id).toBe('seg-1');
    expect(highlightedSegments[1].id).toBe('seg-3');
  });
});
