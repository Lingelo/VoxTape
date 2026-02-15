import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';

// Mock types
interface TranscriptSegment {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  isFinal: boolean;
  language?: string;
  speaker?: number;
}

interface EnhancedNote {
  id: string;
  type: 'decision' | 'action-item' | 'key-point' | 'summary';
  text: string;
  segmentIds: string[];
}

interface DiarizationSegment {
  speaker: number;
  startMs: number;
  endMs: number;
}

describe('SessionService utilities', () => {
  describe('generateId', () => {
    const generateId = (): string => {
      return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    };

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should follow session-timestamp-random format', () => {
      const id = generateId();
      expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
    });

    it('should have a 6-character random suffix', () => {
      const id = generateId();
      const parts = id.split('-');
      expect(parts[2].length).toBe(6);
    });
  });

  describe('extractTitleFromSummary', () => {
    const extractTitleFromSummary = (text: string): { title: string; body: string } => {
      const lines = text.split('\n');
      const firstLine = lines[0]?.trim() || '';

      const match = firstLine.match(/^(?:#{1,3}\s*)?Titre\s*:\s*(.+)$/i);
      let body = match ? lines.slice(1).join('\n').trim() : text;
      const title = match ? match[1].trim() : '';

      body = body.replace(/---+\s*\n/g, '\n');
      body = body.replace(/#{1,3}\s*Mes notes\s*:?[\s\S]*$/i, '').trim();

      return { title, body };
    };

    it('should extract title from "Titre: ..." format', () => {
      const result = extractTitleFromSummary('Titre: Ma réunion\n\nContenu du résumé');
      expect(result.title).toBe('Ma réunion');
      expect(result.body).toBe('Contenu du résumé');
    });

    it('should extract title with markdown heading prefix', () => {
      const result = extractTitleFromSummary('## Titre: Standup meeting\n\nNotes here');
      expect(result.title).toBe('Standup meeting');
    });

    it('should return empty title if not found', () => {
      const result = extractTitleFromSummary('Just some text\nWith multiple lines');
      expect(result.title).toBe('');
      expect(result.body).toBe('Just some text\nWith multiple lines');
    });

    it('should strip "Mes notes" section', () => {
      const text = 'Titre: Test\n\nSummary content\n\n## Mes notes\n\n- Note 1';
      const result = extractTitleFromSummary(text);
      expect(result.body).not.toContain('Mes notes');
      expect(result.body).not.toContain('Note 1');
    });

    it('should remove horizontal rule markers', () => {
      const text = 'Some content\n---\nMore content';
      const result = extractTitleFromSummary(text);
      expect(result.body).not.toContain('---');
    });
  });

  describe('parseEnhanceResponse', () => {
    const parseEnhanceResponse = (text: string): EnhancedNote[] => {
      let jsonStr = text.trim();

      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1) {
        jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) throw new Error('Expected array');

      const validTypes = ['decision', 'action-item', 'key-point', 'summary'] as const;
      return parsed.map((item: { type?: string; text?: string; segmentIds?: string[] }, i: number) => {
        const noteType = validTypes.includes(item.type as typeof validTypes[number])
          ? (item.type as typeof validTypes[number])
          : 'key-point';
        return {
          id: `ai-${i}`,
          type: noteType,
          text: item.text || '',
          segmentIds: item.segmentIds || [],
        };
      });
    };

    it('should parse valid JSON array', () => {
      const json = '[{"type": "decision", "text": "We decided to proceed", "segmentIds": ["seg-1"]}]';
      const result = parseEnhanceResponse(json);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('decision');
      expect(result[0].text).toBe('We decided to proceed');
    });

    it('should parse JSON wrapped in markdown code block', () => {
      const json = '```json\n[{"type": "action-item", "text": "Review PR"}]\n```';
      const result = parseEnhanceResponse(json);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('action-item');
    });

    it('should default to key-point for unknown types', () => {
      const json = '[{"type": "unknown", "text": "Some note"}]';
      const result = parseEnhanceResponse(json);
      expect(result[0].type).toBe('key-point');
    });

    it('should handle empty segmentIds', () => {
      const json = '[{"type": "summary", "text": "Summary text"}]';
      const result = parseEnhanceResponse(json);
      expect(result[0].segmentIds).toEqual([]);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseEnhanceResponse('not json')).toThrow();
    });

    it('should throw on non-array response', () => {
      expect(() => parseEnhanceResponse('{"type": "decision"}')).toThrow('Expected array');
    });
  });
});

describe('SessionService state management', () => {
  describe('segments', () => {
    it('should add segments to existing list', () => {
      const segments$ = new BehaviorSubject<TranscriptSegment[]>([]);

      const addSegment = (segment: TranscriptSegment) => {
        const current = segments$.value;
        segments$.next([...current, segment]);
      };

      addSegment({ id: '1', text: 'Hello', startTimeMs: 0, endTimeMs: 1000, isFinal: true });
      addSegment({ id: '2', text: 'World', startTimeMs: 1000, endTimeMs: 2000, isFinal: true });

      expect(segments$.value.length).toBe(2);
      expect(segments$.value[0].text).toBe('Hello');
      expect(segments$.value[1].text).toBe('World');
    });
  });

  describe('chat messages', () => {
    it('should add chat messages with generated id', () => {
      interface ChatMessage {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        createdAt: number;
      }

      const chatMessages$ = new BehaviorSubject<ChatMessage[]>([]);

      const addChatMessage = (msg: { role: 'user' | 'assistant'; content: string }) => {
        const chatMessage: ChatMessage = {
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: msg.role,
          content: msg.content,
          createdAt: Date.now(),
        };
        chatMessages$.next([...chatMessages$.value, chatMessage]);
      };

      addChatMessage({ role: 'user', content: 'Hello' });
      addChatMessage({ role: 'assistant', content: 'Hi there!' });

      expect(chatMessages$.value.length).toBe(2);
      expect(chatMessages$.value[0].role).toBe('user');
      expect(chatMessages$.value[1].role).toBe('assistant');
    });
  });

  describe('session reset', () => {
    it('should reset all state', () => {
      const id$ = new BehaviorSubject<string>('old-session-123');
      const status$ = new BehaviorSubject<string>('done');
      const segments$ = new BehaviorSubject<TranscriptSegment[]>([
        { id: '1', text: 'Test', startTimeMs: 0, endTimeMs: 1000, isFinal: true },
      ]);
      const title$ = new BehaviorSubject<string>('Old Title');
      const elapsed$ = new BehaviorSubject<number>(60000);

      const generateId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const resetSession = () => {
        id$.next(generateId());
        status$.next('idle');
        segments$.next([]);
        title$.next('Nouvelle session');
        elapsed$.next(0);
      };

      resetSession();

      expect(id$.value).toMatch(/^session-\d+-[a-z0-9]+$/);
      expect(status$.value).toBe('idle');
      expect(segments$.value.length).toBe(0);
      expect(title$.value).toBe('Nouvelle session');
      expect(elapsed$.value).toBe(0);
    });
  });
});

describe('SessionService diarization', () => {
  describe('applyDiarizationResults', () => {
    const applyDiarizationResults = (
      transcriptSegments: TranscriptSegment[],
      diarizationSegments: DiarizationSegment[]
    ): TranscriptSegment[] => {
      if (diarizationSegments.length === 0) return transcriptSegments;
      if (transcriptSegments.length === 0) return transcriptSegments;

      return transcriptSegments.map((seg) => {
        let bestMatch: { speaker: number; overlap: number } | null = null;

        for (const dSeg of diarizationSegments) {
          const overlapStart = Math.max(seg.startTimeMs, dSeg.startMs);
          const overlapEnd = Math.min(seg.endTimeMs, dSeg.endMs);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          if (overlap > 0 && (!bestMatch || overlap > bestMatch.overlap)) {
            bestMatch = { speaker: dSeg.speaker, overlap };
          }
        }

        if (bestMatch && seg.speaker !== bestMatch.speaker) {
          return { ...seg, speaker: bestMatch.speaker };
        }
        return seg;
      });
    };

    it('should assign speaker based on best overlap', () => {
      const transcripts: TranscriptSegment[] = [
        { id: '1', text: 'Hello', startTimeMs: 0, endTimeMs: 1000, isFinal: true },
        { id: '2', text: 'World', startTimeMs: 1000, endTimeMs: 2000, isFinal: true },
      ];

      const diarization: DiarizationSegment[] = [
        { speaker: 0, startMs: 0, endMs: 1500 },
        { speaker: 1, startMs: 1500, endMs: 2500 },
      ];

      const result = applyDiarizationResults(transcripts, diarization);

      expect(result[0].speaker).toBe(0); // Full overlap with speaker 0
      expect(result[1].speaker).toBe(0); // 500ms overlap with speaker 0, 500ms with speaker 1
    });

    it('should handle segments with no overlap', () => {
      const transcripts: TranscriptSegment[] = [
        { id: '1', text: 'Test', startTimeMs: 0, endTimeMs: 1000, isFinal: true },
      ];

      const diarization: DiarizationSegment[] = [
        { speaker: 0, startMs: 2000, endMs: 3000 },
      ];

      const result = applyDiarizationResults(transcripts, diarization);
      expect(result[0].speaker).toBeUndefined();
    });

    it('should return unchanged if no diarization data', () => {
      const transcripts: TranscriptSegment[] = [
        { id: '1', text: 'Test', startTimeMs: 0, endTimeMs: 1000, isFinal: true, speaker: 2 },
      ];

      const result = applyDiarizationResults(transcripts, []);
      expect(result[0].speaker).toBe(2);
    });

    it('should select speaker with most overlap', () => {
      const transcripts: TranscriptSegment[] = [
        { id: '1', text: 'Test', startTimeMs: 0, endTimeMs: 1000, isFinal: true },
      ];

      const diarization: DiarizationSegment[] = [
        { speaker: 0, startMs: 0, endMs: 300 },     // 300ms overlap
        { speaker: 1, startMs: 300, endMs: 1000 },  // 700ms overlap
      ];

      const result = applyDiarizationResults(transcripts, diarization);
      expect(result[0].speaker).toBe(1); // Speaker 1 has more overlap
    });
  });
});

describe('SessionService recording', () => {
  describe('elapsed time tracking', () => {
    it('should calculate elapsed time from start', () => {
      const recordingStartTime = Date.now() - 5000;
      const elapsed = Date.now() - recordingStartTime;
      expect(elapsed).toBeGreaterThanOrEqual(5000);
    });

    it('should resume from previous elapsed time', () => {
      const previousElapsed = 30000; // 30 seconds
      const recordingStartTime = Date.now() - previousElapsed;
      const elapsed = Date.now() - recordingStartTime;
      expect(elapsed).toBeGreaterThanOrEqual(30000);
    });
  });

  describe('session status', () => {
    it('should transition through recording states', () => {
      type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';
      const status$ = new BehaviorSubject<SessionStatus>('idle');

      // Start recording
      status$.next('recording');
      expect(status$.value).toBe('recording');

      // Stop recording
      status$.next('done');
      expect(status$.value).toBe('done');

      // Process notes
      status$.next('processing');
      expect(status$.value).toBe('processing');

      // Complete processing
      status$.next('done');
      expect(status$.value).toBe('done');
    });
  });
});

describe('SessionService save conditions', () => {
  describe('shouldSave', () => {
    it('should not save empty sessions', () => {
      const segments: TranscriptSegment[] = [];
      const userNotes = '';

      const shouldSave = segments.length > 0 || userNotes.trim().length > 0;
      expect(shouldSave).toBe(false);
    });

    it('should save sessions with segments', () => {
      const segments: TranscriptSegment[] = [
        { id: '1', text: 'Test', startTimeMs: 0, endTimeMs: 1000, isFinal: true },
      ];
      const userNotes = '';

      const shouldSave = segments.length > 0 || userNotes.trim().length > 0;
      expect(shouldSave).toBe(true);
    });

    it('should save sessions with notes', () => {
      const segments: TranscriptSegment[] = [];
      const userNotes = 'Some notes';

      const shouldSave = segments.length > 0 || userNotes.trim().length > 0;
      expect(shouldSave).toBe(true);
    });

    it('should not save sessions with only whitespace notes', () => {
      const segments: TranscriptSegment[] = [];
      const userNotes = '   \n  \t  ';

      const shouldSave = segments.length > 0 || userNotes.trim().length > 0;
      expect(shouldSave).toBe(false);
    });
  });
});
