import { contextBridge, ipcRenderer } from 'electron';

const voxtapeApi = {
  audio: {
    sendChunk: (samples: number[]): void => {
      ipcRenderer.send('audio:chunk', samples);
    },
    startRecording: (): void => {
      ipcRenderer.send('audio:recording-start');
    },
    stopRecording: (): void => {
      ipcRenderer.send('audio:recording-stop');
    },
  },

  transcript: {
    onSegment: (
      callback: (segment: {
        id: string;
        text: string;
        startTimeMs: number;
        endTimeMs: number;
        isFinal: boolean;
        language?: string;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, segment: any) => callback(segment);
      ipcRenderer.on('transcript:segment', handler);
      return () => ipcRenderer.removeListener('transcript:segment', handler);
    },
    onPartial: (callback: (data: { text: string }) => void): (() => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('transcript:partial', handler);
      return () => ipcRenderer.removeListener('transcript:partial', handler);
    },
  },

  stt: {
    onStatus: (
      callback: (status: 'loading' | 'ready' | 'error') => void
    ): (() => void) => {
      const handler = (_event: any, status: any) => callback(status);
      ipcRenderer.on('stt:status', handler);
      return () => ipcRenderer.removeListener('stt:status', handler);
    },
    onSpeechDetected: (callback: (detected: boolean) => void): (() => void) => {
      const handler = (_event: any, detected: any) => callback(detected);
      ipcRenderer.on('stt:speech-detected', handler);
      return () =>
        ipcRenderer.removeListener('stt:speech-detected', handler);
    },
    restart: (): Promise<void> => ipcRenderer.invoke('stt:restart'),
  },

  diarization: {
    onStatus: (
      callback: (status: 'loading' | 'ready' | 'not-available' | 'error') => void
    ): (() => void) => {
      const handler = (_event: any, status: any) => callback(status);
      ipcRenderer.on('diarization:status', handler);
      return () => ipcRenderer.removeListener('diarization:status', handler);
    },
    onResult: (
      callback: (result: {
        segments: Array<{ startMs: number; endMs: number; speaker: number }>;
        error?: string;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, result: any) => callback(result);
      ipcRenderer.on('diarization:result', handler);
      return () => ipcRenderer.removeListener('diarization:result', handler);
    },
  },

  llm: {
    initialize: (): void => {
      ipcRenderer.send('llm:initialize');
    },
    prompt: (payload: {
      requestId: string;
      systemPrompt: string;
      userPrompt: string;
      maxTokens?: number;
      temperature?: number;
    }): void => {
      ipcRenderer.send('llm:prompt', payload);
    },
    cancel: (): void => {
      ipcRenderer.send('llm:cancel');
    },
    onToken: (
      callback: (payload: { requestId: string; token: string; isLast: boolean }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('llm:token', handler);
      return () => ipcRenderer.removeListener('llm:token', handler);
    },
    onComplete: (
      callback: (payload: {
        requestId: string;
        fullText: string;
        tokensGenerated: number;
        durationMs: number;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('llm:complete', handler);
      return () => ipcRenderer.removeListener('llm:complete', handler);
    },
    onError: (
      callback: (payload: { requestId: string; error: string }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('llm:error', handler);
      return () => ipcRenderer.removeListener('llm:error', handler);
    },
    onStatus: (
      callback: (status: 'idle' | 'loading' | 'ready' | 'generating' | 'error') => void
    ): (() => void) => {
      const handler = (_event: any, status: any) => callback(status);
      ipcRenderer.on('llm:status', handler);
      return () => ipcRenderer.removeListener('llm:status', handler);
    },
  },

  session: {
    save: (data: any): Promise<any> => ipcRenderer.invoke('session:save', data),
    load: (id: string): Promise<any> => ipcRenderer.invoke('session:load', id),
    list: (): Promise<any> => ipcRenderer.invoke('session:list'),
    delete: (id: string): Promise<any> => ipcRenderer.invoke('session:delete', id),
  },

  search: {
    query: (term: string): Promise<any> => ipcRenderer.invoke('search:query', term),
  },

  folder: {
    create: (name: string, parentId?: string): Promise<any> =>
      ipcRenderer.invoke('folder:create', name, parentId),
    list: (): Promise<any> => ipcRenderer.invoke('folder:list'),
    delete: (id: string): Promise<any> => ipcRenderer.invoke('folder:delete', id),
    moveSession: (sessionId: string, folderId: string | null): Promise<any> =>
      ipcRenderer.invoke('folder:move-session', sessionId, folderId),
  },

  export: {
    markdown: (sessionId: string): Promise<any> =>
      ipcRenderer.invoke('export:markdown', sessionId),
    json: (sessionId: string): Promise<any> =>
      ipcRenderer.invoke('export:json', sessionId),
  },

  config: {
    get: (): Promise<any> => ipcRenderer.invoke('config:get'),
    set: (key: string, value: any): Promise<any> =>
      ipcRenderer.invoke('config:set', key, value),
    reset: (): Promise<any> => ipcRenderer.invoke('config:reset'),
  },

  media: {
    requestMicAccess: (): Promise<boolean> => ipcRenderer.invoke('media:request-mic'),
    requestScreenAccess: (): Promise<boolean> => ipcRenderer.invoke('media:request-screen'),
  },

  systemAudio: {
    start: (): void => ipcRenderer.send('system-audio:start'),
    stop: (): void => ipcRenderer.send('system-audio:stop'),
    isSupported: (): Promise<boolean> => ipcRenderer.invoke('system-audio:supported'),
    onStatus: (callback: (capturing: boolean) => void): (() => void) => {
      const handler = (_event: any, capturing: any) => callback(capturing);
      ipcRenderer.on('system-audio:status', handler);
      return () => ipcRenderer.removeListener('system-audio:status', handler);
    },
    onLevel: (callback: (level: number) => void): (() => void) => {
      const handler = (_event: any, level: number) => callback(level);
      ipcRenderer.on('system-audio:level', handler);
      return () => ipcRenderer.removeListener('system-audio:level', handler);
    },
  },

  model: {
    list: (): Promise<any> => ipcRenderer.invoke('model:list'),
    download: (modelId: string): void => ipcRenderer.send('model:download', modelId),
    delete: (modelId: string): Promise<any> => ipcRenderer.invoke('model:delete', modelId),
    onDownloadProgress: (
      callback: (payload: { modelId: string; progress: number; total: number }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('model:download-progress', handler);
      return () => ipcRenderer.removeListener('model:download-progress', handler);
    },
  },

  meeting: {
    getDetected: (): Promise<any> => ipcRenderer.invoke('meeting:get-detected'),
    isMonitoring: (): Promise<boolean> => ipcRenderer.invoke('meeting:is-monitoring'),
    startMonitoring: (): void => ipcRenderer.send('meeting:start-monitoring'),
    stopMonitoring: (): void => ipcRenderer.send('meeting:stop-monitoring'),
    forceCheck: (): Promise<any> => ipcRenderer.invoke('meeting:force-check'),
    onDetected: (
      callback: (event: {
        type: 'detected';
        apps: Array<{
          bundleId: string;
          name: string;
          pid: number;
          isActive: boolean;
          source: 'process' | 'browser';
        }>;
        timestamp: number;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('meeting:detected', handler);
      return () => ipcRenderer.removeListener('meeting:detected', handler);
    },
    onEnded: (
      callback: (event: {
        type: 'ended';
        apps: Array<any>;
        timestamp: number;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('meeting:ended', handler);
      return () => ipcRenderer.removeListener('meeting:ended', handler);
    },
    onChange: (
      callback: (event: {
        type: 'detected' | 'ended' | 'changed';
        apps: Array<{
          bundleId: string;
          name: string;
          pid: number;
          isActive: boolean;
          source: 'process' | 'browser';
        }>;
        timestamp: number;
      }) => void
    ): (() => void) => {
      const handler = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('meeting:change', handler);
      return () => ipcRenderer.removeListener('meeting:change', handler);
    },
    onStartRecordingRequested: (callback: (data: { meetingName?: string }) => void): (() => void) => {
      const handler = (_event: any, data: { meetingName?: string }) => callback(data || {});
      ipcRenderer.on('meeting:start-recording-requested', handler);
      return () => ipcRenderer.removeListener('meeting:start-recording-requested', handler);
    },
  },
};

contextBridge.exposeInMainWorld('voxtape', voxtapeApi);

export type VoxTapeApi = typeof voxtapeApi;
