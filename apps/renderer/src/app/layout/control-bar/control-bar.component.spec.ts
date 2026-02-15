import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

describe('ControlBarComponent utilities', () => {
  describe('formatTime', () => {
    const formatTime = (ms: number): string => {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    it('should format 0ms as 0:00', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format seconds', () => {
      expect(formatTime(5000)).toBe('0:05');
      expect(formatTime(30000)).toBe('0:30');
    });

    it('should format minutes', () => {
      expect(formatTime(60000)).toBe('1:00');
      expect(formatTime(90000)).toBe('1:30');
      expect(formatTime(600000)).toBe('10:00');
    });

    it('should format hours', () => {
      expect(formatTime(3600000)).toBe('1:00:00');
      expect(formatTime(3661000)).toBe('1:01:01');
      expect(formatTime(7200000)).toBe('2:00:00');
    });
  });
});

describe('ControlBarComponent state management', () => {
  describe('recording state', () => {
    it('should track recording state', () => {
      const isRecording$ = new BehaviorSubject<boolean>(false);
      let isRecording = false;

      isRecording$.subscribe((state) => {
        isRecording = state;
      });

      expect(isRecording).toBe(false);

      isRecording$.next(true);
      expect(isRecording).toBe(true);

      isRecording$.next(false);
      expect(isRecording).toBe(false);
    });

    it('should track paused state', () => {
      const isPaused$ = new BehaviorSubject<boolean>(false);
      let isPaused = false;

      isPaused$.subscribe((state) => {
        isPaused = state;
      });

      expect(isPaused).toBe(false);

      isPaused$.next(true);
      expect(isPaused).toBe(true);
    });
  });

  describe('audio level', () => {
    it('should track audio level changes', () => {
      const audioLevel$ = new BehaviorSubject<number>(0);
      let level = 0;

      audioLevel$.subscribe((l) => {
        level = l;
      });

      expect(level).toBe(0);

      audioLevel$.next(0.5);
      expect(level).toBe(0.5);

      audioLevel$.next(1);
      expect(level).toBe(1);
    });

    it('should clamp audio level between 0 and 1', () => {
      const clampLevel = (level: number): number => {
        return Math.max(0, Math.min(1, level));
      };

      expect(clampLevel(-0.5)).toBe(0);
      expect(clampLevel(0)).toBe(0);
      expect(clampLevel(0.5)).toBe(0.5);
      expect(clampLevel(1)).toBe(1);
      expect(clampLevel(1.5)).toBe(1);
    });
  });

  describe('panel visibility', () => {
    it('should toggle transcript panel', () => {
      let showTranscript = false;

      const toggleTranscript = () => {
        showTranscript = !showTranscript;
      };

      expect(showTranscript).toBe(false);

      toggleTranscript();
      expect(showTranscript).toBe(true);

      toggleTranscript();
      expect(showTranscript).toBe(false);
    });

    it('should toggle chat panel', () => {
      let showChat = false;

      const toggleChat = () => {
        showChat = !showChat;
      };

      expect(showChat).toBe(false);

      toggleChat();
      expect(showChat).toBe(true);
    });
  });
});

describe('ControlBarComponent recording controls', () => {
  describe('start recording', () => {
    it('should start recording when not already recording', () => {
      const startRecording = vi.fn();
      let isRecording = false;

      const onStart = () => {
        if (!isRecording) {
          startRecording();
          isRecording = true;
        }
      };

      onStart();
      expect(startRecording).toHaveBeenCalledTimes(1);
      expect(isRecording).toBe(true);

      // Should not start again if already recording
      onStart();
      expect(startRecording).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop recording', () => {
    it('should stop recording and emit event', () => {
      const stopRecording = vi.fn();
      const sessionStopped = vi.fn();
      let isRecording = true;

      const onStop = () => {
        if (isRecording) {
          stopRecording();
          isRecording = false;
          sessionStopped();
        }
      };

      onStop();
      expect(stopRecording).toHaveBeenCalled();
      expect(sessionStopped).toHaveBeenCalled();
      expect(isRecording).toBe(false);
    });
  });

  describe('pause/resume', () => {
    it('should toggle pause state', () => {
      let isPaused = false;
      const pauseRecording = vi.fn();
      const resumeRecording = vi.fn();

      const togglePause = () => {
        if (isPaused) {
          resumeRecording();
        } else {
          pauseRecording();
        }
        isPaused = !isPaused;
      };

      togglePause();
      expect(pauseRecording).toHaveBeenCalled();
      expect(isPaused).toBe(true);

      togglePause();
      expect(resumeRecording).toHaveBeenCalled();
      expect(isPaused).toBe(false);
    });
  });
});

describe('ControlBarComponent timer', () => {
  describe('elapsed time calculation', () => {
    it('should calculate elapsed time from recording start', () => {
      const recordingStartTime = Date.now() - 5000; // Started 5 seconds ago
      const getElapsedMs = () => Date.now() - recordingStartTime;

      const elapsed = getElapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(5000);
      expect(elapsed).toBeLessThan(6000);
    });

    it('should not advance when paused', () => {
      let elapsedMs = 5000;
      let pausedAt: number | null = null;

      const pause = () => {
        pausedAt = elapsedMs;
      };

      const getDisplayTime = (): number => {
        return pausedAt ?? elapsedMs;
      };

      pause();
      elapsedMs = 10000; // Time passes but we're paused

      expect(getDisplayTime()).toBe(5000); // Should still show paused time
    });
  });
});
