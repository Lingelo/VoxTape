import { describe, it, expect } from 'vitest';
import { IpcChannels, IpcChannel } from './ipc-channels';

describe('IpcChannels', () => {
  it('should export IpcChannels object', () => {
    expect(typeof IpcChannels).toBe('object');
    expect(IpcChannels).not.toBeNull();
  });

  it('should have audio channels', () => {
    expect(IpcChannels.AUDIO_CHUNK).toBe('audio:chunk');
    expect(IpcChannels.RECORDING_START).toBe('audio:recording-start');
    expect(IpcChannels.RECORDING_STOP).toBe('audio:recording-stop');
  });

  it('should have transcript channels', () => {
    expect(IpcChannels.TRANSCRIPT_SEGMENT).toBe('transcript:segment');
    expect(IpcChannels.TRANSCRIPT_PARTIAL).toBe('transcript:partial');
  });

  it('should have STT channels', () => {
    expect(IpcChannels.STT_STATUS).toBe('stt:status');
    expect(IpcChannels.SPEECH_DETECTED).toBe('stt:speech-detected');
  });

  it('should have LLM channels', () => {
    expect(IpcChannels.LLM_INITIALIZE).toBe('llm:initialize');
    expect(IpcChannels.LLM_PROMPT).toBe('llm:prompt');
    expect(IpcChannels.LLM_CANCEL).toBe('llm:cancel');
    expect(IpcChannels.LLM_TOKEN).toBe('llm:token');
    expect(IpcChannels.LLM_COMPLETE).toBe('llm:complete');
    expect(IpcChannels.LLM_ERROR).toBe('llm:error');
    expect(IpcChannels.LLM_STATUS).toBe('llm:status');
  });

  it('should have session channels', () => {
    expect(IpcChannels.SESSION_SAVE).toBe('session:save');
    expect(IpcChannels.SESSION_LOAD).toBe('session:load');
    expect(IpcChannels.SESSION_LIST).toBe('session:list');
    expect(IpcChannels.SESSION_DELETE).toBe('session:delete');
  });

  it('should have folder channels', () => {
    expect(IpcChannels.FOLDER_CREATE).toBe('folder:create');
    expect(IpcChannels.FOLDER_LIST).toBe('folder:list');
    expect(IpcChannels.FOLDER_DELETE).toBe('folder:delete');
    expect(IpcChannels.FOLDER_MOVE_SESSION).toBe('folder:move-session');
  });

  it('should have export channels', () => {
    expect(IpcChannels.EXPORT_MARKDOWN).toBe('export:markdown');
    expect(IpcChannels.EXPORT_JSON).toBe('export:json');
  });

  it('should have config channels', () => {
    expect(IpcChannels.CONFIG_GET).toBe('config:get');
    expect(IpcChannels.CONFIG_SET).toBe('config:set');
  });

  it('should have model manager channels', () => {
    expect(IpcChannels.MODEL_LIST).toBe('model:list');
    expect(IpcChannels.MODEL_DOWNLOAD).toBe('model:download');
    expect(IpcChannels.MODEL_DELETE).toBe('model:delete');
    expect(IpcChannels.MODEL_DOWNLOAD_PROGRESS).toBe('model:download-progress');
  });

  it('should have system audio channels', () => {
    expect(IpcChannels.SYSTEM_AUDIO_START).toBe('system-audio:start');
    expect(IpcChannels.SYSTEM_AUDIO_STOP).toBe('system-audio:stop');
    expect(IpcChannels.SYSTEM_AUDIO_SUPPORTED).toBe('system-audio:supported');
    expect(IpcChannels.SYSTEM_AUDIO_STATUS).toBe('system-audio:status');
    expect(IpcChannels.SYSTEM_AUDIO_LEVEL).toBe('system-audio:level');
  });

  it('should have unique channel values', () => {
    const values = Object.values(IpcChannels);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it('should follow domain:action naming convention', () => {
    const values = Object.values(IpcChannels);
    values.forEach((channel) => {
      expect(channel).toMatch(/^[a-z-]+:[a-z-]+$/);
    });
  });
});

describe('IpcChannel type', () => {
  it('should allow valid channel values', () => {
    // TypeScript compile-time check
    const channel: IpcChannel = 'audio:chunk';
    expect(channel).toBe(IpcChannels.AUDIO_CHUNK);
  });
});
