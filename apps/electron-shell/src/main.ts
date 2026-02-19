import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  dialog,
  systemPreferences,
  Notification,
} from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, copyFileSync, writeFileSync, rmSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import {
  BackendModule,
  SttService,
  AudioService,
  LlmService,
  DatabaseService,
  ExportService,
  ConfigService,
  ModelManagerService,
  SystemAudioService,
  DiarizationService,
  MeetingDetectionService,
} from '@sourdine/backend';
import type { LlmPromptPayload, MeetingDetectionEvent } from '@sourdine/shared-types';

// ── State ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sttService: SttService;
let audioService: AudioService;
let llmService: LlmService;
let databaseService: DatabaseService;
let exportService: ExportService;
let configService: ConfigService;
let modelManager: ModelManagerService;
let systemAudioService: SystemAudioService;
let diarizationService: DiarizationService;
let meetingDetectionService: MeetingDetectionService;
let isRecording = false;
let lastMeetingNotificationId: string | null = null;
let meetingNotificationDismissed = false;
let lastDetectedMeetingName: string | null = null;

app.setName('Sourdine');
const isDev = !app.isPackaged;
const preloadPath = join(__dirname, 'preload.js');
const rendererUrl = isDev
  ? 'http://localhost:4200'
  : `file://${join(__dirname, '..', 'renderer', 'index.html')}`;

// ── NestJS Bootstrap ───────────────────────────────────────────────────────

async function bootstrapNest(): Promise<void> {
  const appContext = await NestFactory.createApplicationContext(BackendModule, {
    logger: ['error', 'warn'],
  });
  sttService = appContext.get(SttService);
  audioService = appContext.get(AudioService);
  llmService = appContext.get(LlmService);
  databaseService = appContext.get(DatabaseService);
  exportService = appContext.get(ExportService);
  configService = appContext.get(ConfigService);
  modelManager = appContext.get(ModelManagerService);
  systemAudioService = appContext.get(SystemAudioService);
  diarizationService = appContext.get(DiarizationService);
  meetingDetectionService = appContext.get(MeetingDetectionService);

  // Set worker paths relative to this bundle
  sttService.setWorkerPath(join(__dirname, 'stt-worker.js'));
  llmService.setWorkerPath(join(__dirname, 'llm-worker.js'));
  diarizationService.setWorkerPath(join(__dirname, 'diarization-worker.js'));

  // Initialize database, config, and model manager
  const userData = app.getPath('userData');
  databaseService.open(userData);
  configService.open(userData);

  // Feed LLM config from persisted settings
  const llmCfg = configService.get('llm');
  llmService.setLlmConfig({
    contextSize: llmCfg.contextSize,
    temperature: llmCfg.temperature,
  });

  const modelsDir = join(userData, 'models');

  // Migrate models from legacy paths to Application Support/Sourdine/models
  const legacyDirs: string[] = [];
  if (process.platform === 'darwin') {
    legacyDirs.push(join(homedir(), 'Library', 'Application Support', 'Electron', 'models'));
  }
  // Dev project models directory
  legacyDirs.push(join(__dirname, '..', '..', '..', 'models'));

  for (const legacyDir of legacyDirs) {
    if (!existsSync(legacyDir)) continue;
    for (const subdir of ['llm', 'vad', 'stt', 'diarization']) {
      const src = join(legacyDir, subdir);
      const dest = join(modelsDir, subdir);
      if (!existsSync(src)) continue;
      for (const file of readdirSync(src)) {
        const destFile = join(dest, file);
        if (!existsSync(destFile)) {
          console.log(`[Main] Migrating model: ${subdir}/${file}`);
          copyFileSync(join(src, file), destFile);
        }
      }
    }
  }

  modelManager.setModelsDir(modelsDir);
  // Pass models dir to workers via env so they can find downloaded models
  process.env.SOURDINE_MODELS_DIR = modelsDir;
}

// ── Dock Icon ─────────────────────────────────────────────────────────────

function setDockIcon(): void {
  const size = 256;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" fill="none">
    <rect width="128" height="128" rx="28" fill="#1a1a1a"/>
    <path d="M38 52c-4 4-6 9-6 14s2 10 6 14" stroke="#4ade80" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.5"/>
    <path d="M44 56c-2.5 2.5-4 6-4 9s1.5 6.5 4 9" stroke="#4ade80" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.75"/>
    <rect x="56" y="40" width="16" height="32" rx="8" fill="#4ade80"/>
    <rect x="56" y="40" width="16" height="10" rx="8" fill="#3bc96f"/>
    <path d="M64 76v12" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
    <path d="M56 88h16" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
    <path d="M84 56c2.5 2.5 4 6 4 9s-1.5 6.5-4 9" stroke="#4ade80" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.75"/>
    <path d="M90 52c4 4 6 9 6 14s-2 10-6 14" stroke="#4ade80" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.5"/>
  </svg>`;

  const html = `<html><body style="margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden">${svg}</body></html>`;
  const win = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      win.webContents.capturePage().then((image) => {
        const resized = image.resize({ width: 128, height: 128 });
        if (app.dock) app.dock.setIcon(resized);
        win.destroy();
      }).catch(() => win.destroy());
    }, 150);
  });
}

// ── Window Creation ────────────────────────────────────────────────────────

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Sourdine',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload scripts
    },
  });

  mainWindow.loadURL(rendererUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────

function createTray(): void {
  // Use a simple 16x16 template image for macOS menu bar
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Sourdine');
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRecording ? 'Arrêter l\'enregistrement' : 'Démarrer l\'enregistrement',
      click: () => toggleRecording(),
    },
    { type: 'separator' },
    {
      label: 'Ouvrir Sourdine',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── Recording Control ──────────────────────────────────────────────────────

function toggleRecording(): void {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording(): void {
  if (isRecording) return;
  isRecording = true;

  audioService.startRecording();
  // Diarization disabled - too slow for real-time use
  // diarizationService.startRecording();
  updateTrayMenu();

  mainWindow?.webContents.send('audio:recording-start');
}

function stopRecording(): void {
  if (!isRecording) return;
  isRecording = false;

  audioService.stopRecording();
  // Diarization disabled - too slow for real-time use
  // diarizationService.stopRecording();
  // Also stop system audio capture if active
  if (systemAudioService?.isCapturing) {
    systemAudioService.stop();
  }
  updateTrayMenu();

  mainWindow?.webContents.send('audio:recording-stop');
}

// ── IPC Wiring ─────────────────────────────────────────────────────────────

function setupIpc(): void {
  // Audio chunks from renderer
  ipcMain.on('audio:chunk', (_event, samples: number[]) => {
    audioService.handleAudioChunk(new Int16Array(samples));
  });

  // Recording control from renderer
  ipcMain.on('audio:recording-start', () => startRecording());
  ipcMain.on('audio:recording-stop', () => stopRecording());

  // Forward STT events to renderer windows
  sttService.on('segment', (segment) => {
    mainWindow?.webContents.send('transcript:segment', segment);
  });

  sttService.on('partial', (data) => {
    mainWindow?.webContents.send('transcript:partial', data);
  });

  sttService.on('status', (status) => {
    mainWindow?.webContents.send('stt:status', status);
  });

  sttService.on('speech-detected', (detected) => {
    mainWindow?.webContents.send('stt:speech-detected', detected);
  });

  // Forward diarization events to renderer
  diarizationService.on('status', (status) => {
    mainWindow?.webContents.send('diarization:status', status);
  });

  diarizationService.on('result', (result) => {
    mainWindow?.webContents.send('diarization:result', result);
  });

  // ── LLM IPC ──────────────────────────────────────────────────────────
  ipcMain.on('llm:initialize', () => {
    llmService.initialize().catch((err) => {
      console.error('[Main] LLM initialization failed:', err.message);
    });
  });

  ipcMain.on('llm:prompt', (_event, payload: LlmPromptPayload) => {
    llmService.prompt(payload);
  });

  ipcMain.on('llm:cancel', () => {
    llmService.cancel();
  });

  llmService.on('token', (payload) => {
    mainWindow?.webContents.send('llm:token', payload);
  });

  llmService.on('complete', (payload) => {
    mainWindow?.webContents.send('llm:complete', payload);
  });

  llmService.on('error', (payload) => {
    mainWindow?.webContents.send('llm:error', payload);
  });

  llmService.on('status', (status) => {
    mainWindow?.webContents.send('llm:status', status);
  });

  // ── Database IPC (invoke/handle pattern) ──────────────────────────
  ipcMain.handle('session:save', (_event, data) => {
    try {
      databaseService.saveSession(data);
      return { ok: true };
    } catch (err: any) {
      console.error('[Main] session:save error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('session:load', (_event, id: string) => {
    try {
      return databaseService.getSession(id);
    } catch (err: any) {
      console.error('[Main] session:load error:', err.message);
      return null;
    }
  });

  ipcMain.handle('session:list', () => {
    try {
      return databaseService.listSessions();
    } catch (err: any) {
      console.error('[Main] session:list error:', err.message);
      return [];
    }
  });

  ipcMain.handle('session:delete', (_event, id: string) => {
    try {
      databaseService.deleteSession(id);
      return { ok: true };
    } catch (err: any) {
      console.error('[Main] session:delete error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('folder:create', (_event, name: string, parentId?: string) => {
    try {
      return databaseService.createFolder(name, parentId);
    } catch (err: any) {
      console.error('[Main] folder:create error:', err.message);
      return null;
    }
  });

  ipcMain.handle('folder:list', () => {
    try {
      return databaseService.listFolders();
    } catch (err: any) {
      console.error('[Main] folder:list error:', err.message);
      return [];
    }
  });

  ipcMain.handle('folder:delete', (_event, id: string) => {
    try {
      databaseService.deleteFolder(id);
      return { ok: true };
    } catch (err: any) {
      console.error('[Main] folder:delete error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('folder:move-session', (_event, sessionId: string, folderId: string | null) => {
    try {
      databaseService.moveSession(sessionId, folderId);
      return { ok: true };
    } catch (err: any) {
      console.error('[Main] folder:move-session error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('search:query', (_event, term: string) => {
    try {
      return databaseService.search(term);
    } catch (err: any) {
      console.error('[Main] search:query error:', err.message);
      return [];
    }
  });

  // ── Export IPC ────────────────────────────────────────────────────
  ipcMain.handle('export:markdown', async (_event, sessionId: string) => {
    const content = exportService.exportMarkdown(sessionId);
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exporter en Markdown',
      defaultPath: `session-${sessionId}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, content, 'utf-8');
      return { ok: true, path: result.filePath };
    }
    return { ok: false };
  });

  ipcMain.handle('export:json', async (_event, sessionId: string) => {
    const content = exportService.exportJson(sessionId);
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exporter en JSON',
      defaultPath: `session-${sessionId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, content, 'utf-8');
      return { ok: true, path: result.filePath };
    }
    return { ok: false };
  });

  // ── Config IPC ────────────────────────────────────────────────────

  // Whitelist of allowed config keys with their expected types
  const CONFIG_WHITELIST: Record<string, 'string' | 'number' | 'boolean' | 'string|null'> = {
    'language': 'string',
    'theme': 'string',
    'audio.defaultDeviceId': 'string|null',
    'audio.systemAudioEnabled': 'boolean',
    'llm.modelPath': 'string|null',
    'llm.contextSize': 'number',
    'llm.temperature': 'number',
    'stt.modelPath': 'string|null',
    'meetingDetection.enabled': 'boolean',
    'meetingDetection.detectWebMeetings': 'boolean',
    'meetingDetection.showNotification': 'boolean',
    'meetingDetection.notificationDurationMs': 'number',
    'meetingDetection.pollIntervalMs': 'number',
    'onboardingComplete': 'boolean',
  };

  function validateConfigValue(key: string, value: unknown): boolean {
    const expectedType = CONFIG_WHITELIST[key];
    if (!expectedType) return false;

    if (expectedType === 'string|null') {
      return value === null || typeof value === 'string';
    }
    return typeof value === expectedType;
  }

  ipcMain.handle('config:get', () => {
    return configService.getAll();
  });

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    // Validate key is in whitelist
    if (!(key in CONFIG_WHITELIST)) {
      console.warn(`[config:set] Rejected unknown config key: ${key}`);
      return { ok: false, error: 'Invalid config key' };
    }

    // Validate value type
    if (!validateConfigValue(key, value)) {
      console.warn(`[config:set] Rejected invalid value type for key: ${key}`);
      return { ok: false, error: 'Invalid value type' };
    }

    configService.set(key, value);
    // Live-update LLM config when relevant keys change
    if (key.startsWith('llm.')) {
      const llmCfg = configService.get('llm');
      llmService.setLlmConfig({
        contextSize: llmCfg.contextSize,
        temperature: llmCfg.temperature,
      });
    }
    // Live-update meeting detection config when relevant keys change
    if (key.startsWith('meetingDetection.')) {
      const meetingCfg = configService.get('meetingDetection');
      meetingDetectionService.setConfig(meetingCfg);
    }
    return { ok: true };
  });

  ipcMain.handle('config:reset', () => {
    configService.reset();
    databaseService.clearAll();
    // Delete all downloaded models
    const modelsPath = process.env.SOURDINE_MODELS_DIR || join(app.getPath('userData'), 'models');
    for (const subdir of ['llm', 'vad', 'stt', 'diarization']) {
      const dir = join(modelsPath, subdir);
      if (existsSync(dir)) {
        for (const file of readdirSync(dir)) {
          rmSync(join(dir, file), { recursive: true, force: true });
        }
      }
    }
    return { ok: true };
  });

  // ── Media Access IPC ────────────────────────────────────────────────
  ipcMain.handle('media:request-mic', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        return granted;
      }
      return true;
    }
    return true; // Non-macOS: assume granted
  });

  // ── Screen Access IPC ──────────────────────────────────────────────
  ipcMain.handle('media:request-screen', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      return status === 'granted';
    }
    return true;
  });

  // ── Model Manager IPC ──────────────────────────────────────────────
  ipcMain.handle('model:list', () => {
    return {
      known: modelManager.listKnown(),
      downloaded: modelManager.listDownloaded(),
    };
  });

  ipcMain.on('model:download', (_event, modelId: string) => {
    modelManager.download(modelId).catch((err) => {
      console.error(`[Main] Model download failed (${modelId}):`, err.message);
      mainWindow?.webContents.send('model:download-error', { modelId, error: err.message });
    });
  });

  ipcMain.handle('model:delete', (_event, modelId: string) => {
    modelManager.deleteModel(modelId);
    return { ok: true };
  });

  modelManager.on('download-progress', (payload) => {
    mainWindow?.webContents.send('model:download-progress', payload);

    // Auto-restart STT when required models finish downloading
    const isDone = payload.progress >= payload.total && payload.total > 0;
    if (isDone && (payload.modelId === 'silero-vad' || payload.modelId === 'parakeet-tdt-v3')) {
      if (sttService.status !== 'ready') {
        console.log(`[Main] Model ${payload.modelId} downloaded, restarting STT...`);
        sttService.restart().catch((err) => {
          console.error('[Main] STT restart after model download failed:', err.message);
        });
      }
    }
  });

  // ── STT IPC ───────────────────────────────────────────────────────
  ipcMain.handle('stt:restart', async () => {
    await sttService.restart();
    return { ok: true };
  });

  // ── System Audio IPC ──────────────────────────────────────────────
  ipcMain.on('system-audio:start', () => {
    systemAudioService.start();
    mainWindow?.webContents.send('system-audio:status', systemAudioService.isCapturing);
  });

  ipcMain.on('system-audio:stop', () => {
    systemAudioService.stop();
    mainWindow?.webContents.send('system-audio:status', systemAudioService.isCapturing);
  });

  ipcMain.handle('system-audio:supported', () => {
    return systemAudioService.isSupported();
  });

  // Forward system audio level to renderer
  systemAudioService.on('level', (level: number) => {
    mainWindow?.webContents.send('system-audio:level', level);
  });

  // ── Meeting Notification ─────────────────────────────────────────────
  function showMeetingNotification(appName: string): void {
    if (!Notification.isSupported()) {
      console.log('[Main] System notifications not supported');
      return;
    }

    // Save the meeting name so we can use it when the notification is clicked
    // (even if the meeting "ends" before the click due to tab switching)
    lastDetectedMeetingName = appName;

    const notification = new Notification({
      title: `🎙️ ${appName} détecté`,
      body: 'Cliquez pour démarrer l\'enregistrement',
      silent: false,
      urgency: 'normal',
      timeoutType: 'default',
      // Note: actions only work when the app is signed and packaged
      actions: [
        { type: 'button', text: 'Enregistrer' },
        { type: 'button', text: 'Ignorer' },
      ],
    });

    notification.on('click', () => {
      // Show and focus the main window, then start recording
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        // Start recording automatically when notification is clicked
        // Pass the meeting name we saved earlier
        mainWindow.webContents.send('meeting:start-recording-requested', {
          meetingName: lastDetectedMeetingName
        });
      }
    });

    notification.on('action', (_event: any, index: number) => {
      if (index === 0) {
        // "Enregistrer" button clicked - start recording
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('meeting:start-recording-requested');
        }
      } else if (index === 1) {
        // "Ignorer" button clicked - dismiss and don't show again for this meeting
        meetingNotificationDismissed = true;
      }
    });

    notification.show();
  }

  // ── Meeting Detection IPC ──────────────────────────────────────────
  ipcMain.handle('meeting:get-detected', () => {
    return meetingDetectionService.detectedApps;
  });

  ipcMain.handle('meeting:is-monitoring', () => {
    return meetingDetectionService.isMonitoring;
  });

  ipcMain.on('meeting:start-monitoring', () => {
    meetingDetectionService.startMonitoring();
  });

  ipcMain.on('meeting:stop-monitoring', () => {
    meetingDetectionService.stopMonitoring();
  });

  ipcMain.handle('meeting:force-check', () => {
    return meetingDetectionService.forceCheck();
  });

  // Forward meeting detection events to renderer
  meetingDetectionService.on('detected', (event: MeetingDetectionEvent) => {
    mainWindow?.webContents.send('meeting:detected', event);

    // Show system notification if enabled and not already recording
    const meetingConfig = configService.get('meetingDetection');
    if (meetingConfig?.showNotification && !isRecording && !meetingNotificationDismissed) {
      const app = event.apps[0];
      if (app) {
        // Avoid duplicate notifications for the same meeting
        if (lastMeetingNotificationId !== app.bundleId) {
          lastMeetingNotificationId = app.bundleId;
          showMeetingNotification(app.name);
        }
      }
    }
  });

  meetingDetectionService.on('ended', (event: MeetingDetectionEvent) => {
    mainWindow?.webContents.send('meeting:ended', event);
    // Reset notification state when meeting ends
    lastMeetingNotificationId = null;
    meetingNotificationDismissed = false;
  });

  meetingDetectionService.on('change', (event: MeetingDetectionEvent) => {
    mainWindow?.webContents.send('meeting:change', event);
  });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Bootstrap NestJS services
  await bootstrapNest();

  // Initialize STT (async, non-blocking — will emit 'ready' when done)
  sttService.initialize().catch((err) => {
    console.error('[Main] STT initialization failed:', err.message);
    console.error('[Main] Transcription will not be available.');
  });

  // Diarization disabled - too slow for real-time use
  // diarizationService.initialize().catch((err) => {
  //   console.error('[Main] Diarization initialization failed:', err.message);
  //   console.error('[Main] Speaker identification will not be available.');
  // });

  // Configure meeting detection (but don't start yet - need window first)
  const meetingConfig = configService.get('meetingDetection');
  if (meetingConfig) {
    meetingDetectionService.setConfig(meetingConfig);
  }

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    setDockIcon();
  }


  // Create windows
  createMainWindow();
  createTray();

  // Start meeting detection AFTER window is created (so IPC events can be sent)
  if (meetingConfig?.enabled !== false) {
    meetingDetectionService.startMonitoring();
  }

  // Application menu
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Sourdine',
      submenu: [
        { role: 'about', label: 'A propos de Sourdine' },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer Sourdine' },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter Sourdine' },
      ],
    },
    {
      label: 'Edition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Retablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout selectionner' },
      ],
    },
    {
      label: 'Fenetre',
      submenu: [
        { role: 'minimize', label: 'Reduire' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Tout ramener au premier plan' },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);

  // Setup IPC
  setupIpc();

  // Send current STT status once renderer is ready (event may have fired before listener)
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('stt:status', sttService.status);
  });

  // Global shortcut: Cmd+R to toggle recording
  globalShortcut.register('CommandOrControl+R', () => {
    toggleRecording();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  // Stop system audio capture before quitting
  if (systemAudioService?.isCapturing) {
    systemAudioService.stop();
  }
  await Promise.all([
    sttService?.shutdown(),
    llmService?.shutdown(),
  ]);
});
