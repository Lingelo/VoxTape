export const IpcChannels = {
  // Audio: renderer -> main
  AUDIO_CHUNK: 'audio:chunk',
  RECORDING_START: 'audio:recording-start',
  RECORDING_STOP: 'audio:recording-stop',

  // Transcript: main -> renderer
  TRANSCRIPT_SEGMENT: 'transcript:segment',
  TRANSCRIPT_PARTIAL: 'transcript:partial',

  // STT status: main -> renderer
  STT_STATUS: 'stt:status',
  SPEECH_DETECTED: 'stt:speech-detected',

  // Widget: main -> widget
  WIDGET_STATE: 'widget:state',

  // Device: renderer -> main -> renderer
  DEVICE_LIST_REQUEST: 'device:list-request',
  DEVICE_LIST_RESPONSE: 'device:list-response',

  // LLM: renderer -> main
  LLM_INITIALIZE: 'llm:initialize',
  LLM_PROMPT: 'llm:prompt',
  LLM_CANCEL: 'llm:cancel',

  // LLM: main -> renderer
  LLM_TOKEN: 'llm:token',
  LLM_COMPLETE: 'llm:complete',
  LLM_ERROR: 'llm:error',
  LLM_STATUS: 'llm:status',

  // Session persistence: renderer -> main (invoke/handle)
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
  SESSION_DELETE: 'session:delete',

  // Folders: renderer -> main (invoke/handle)
  FOLDER_CREATE: 'folder:create',
  FOLDER_LIST: 'folder:list',
  FOLDER_DELETE: 'folder:delete',
  FOLDER_MOVE_SESSION: 'folder:move-session',

  // Search: renderer -> main (invoke/handle)
  SEARCH_QUERY: 'search:query',

  // Export: renderer -> main (invoke/handle)
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_JSON: 'export:json',

  // Config: renderer -> main (invoke/handle)
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Model Manager: renderer -> main
  MODEL_LIST: 'model:list',
  MODEL_DOWNLOAD: 'model:download',
  MODEL_DELETE: 'model:delete',
  MODEL_DOWNLOAD_PROGRESS: 'model:download-progress',

  // Summary History: renderer -> main (invoke/handle)
  SUMMARY_HISTORY_SAVE: 'summary-history:save',
  SUMMARY_HISTORY_LIST: 'summary-history:list',

  // System Audio: renderer -> main
  SYSTEM_AUDIO_START: 'system-audio:start',
  SYSTEM_AUDIO_STOP: 'system-audio:stop',
  SYSTEM_AUDIO_SUPPORTED: 'system-audio:supported',
  SYSTEM_AUDIO_STATUS: 'system-audio:status',
  SYSTEM_AUDIO_LEVEL: 'system-audio:level',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
