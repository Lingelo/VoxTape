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
} from '@sourdine/backend';
import type { LlmPromptPayload } from '@sourdine/shared-types';

// ── State ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sttService: SttService;
let audioService: AudioService;
let llmService: LlmService;
let databaseService: DatabaseService;
let exportService: ExportService;
let configService: ConfigService;
let modelManager: ModelManagerService;
let systemAudioService: SystemAudioService;
let isRecording = false;

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

  // Set worker paths relative to this bundle
  sttService.setWorkerPath(join(__dirname, 'stt-worker.js'));
  llmService.setWorkerPath(join(__dirname, 'llm-worker.js'));

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
    for (const subdir of ['llm', 'vad', 'stt']) {
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

  // Widget disabled — keep handlers as no-ops for now
  mainWindow.on('blur', () => {});
  mainWindow.on('focus', () => {});

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createWidgetWindow(): void {
  widgetWindow = new BrowserWindow({
    width: 140,
    height: 42,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const widgetUrl = isDev
    ? 'http://localhost:4200/widget'
    : `file://${join(__dirname, '..', 'renderer', 'index.html')}#/widget`;

  widgetWindow.loadURL(widgetUrl);
  widgetWindow.hide(); // Hidden by default, shown when recording + main unfocused

  widgetWindow.on('closed', () => {
    widgetWindow = null;
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
  broadcastWidgetState();
  updateTrayMenu();

  mainWindow?.webContents.send('audio:recording-start');
}

function stopRecording(): void {
  if (!isRecording) return;
  isRecording = false;

  audioService.stopRecording();
  // Also stop system audio capture if active
  if (systemAudioService?.isCapturing) {
    systemAudioService.stop();
  }
  broadcastWidgetState();
  updateTrayMenu();

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }

  mainWindow?.webContents.send('audio:recording-stop');
}

function broadcastWidgetState(): void {
  const state = { isRecording, audioLevel: 0 };
  widgetWindow?.webContents.send('widget:state', state);
}

// ── IPC Wiring ─────────────────────────────────────────────────────────────

function setupIpc(): void {
  // Audio chunks from renderer
  ipcMain.on('audio:chunk', (_event, samples: number[]) => {
    audioService.handleAudioChunk(new Int16Array(samples));

    // Calculate audio level for widget VU meter
    if (isRecording && samples.length > 0) {
      const rms = Math.sqrt(
        samples.reduce((sum: number, s: number) => sum + s * s, 0) / samples.length
      );
      const level = Math.min(1, rms / 10000); // Normalize to 0-1
      widgetWindow?.webContents.send('widget:state', {
        isRecording,
        audioLevel: level,
      });
    }
  });

  // Recording control from renderer
  ipcMain.on('audio:recording-start', () => startRecording());
  ipcMain.on('audio:recording-stop', () => stopRecording());

  // Widget controls
  ipcMain.on('widget:toggle-recording', () => toggleRecording());
  ipcMain.on('widget:focus-main', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

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
    databaseService.saveSession(data);
    return { ok: true };
  });

  ipcMain.handle('session:load', (_event, id: string) => {
    return databaseService.getSession(id);
  });

  ipcMain.handle('session:list', () => {
    return databaseService.listSessions();
  });

  ipcMain.handle('session:delete', (_event, id: string) => {
    databaseService.deleteSession(id);
    return { ok: true };
  });

  ipcMain.handle('folder:create', (_event, name: string, parentId?: string) => {
    return databaseService.createFolder(name, parentId);
  });

  ipcMain.handle('folder:list', () => {
    return databaseService.listFolders();
  });

  ipcMain.handle('folder:delete', (_event, id: string) => {
    databaseService.deleteFolder(id);
    return { ok: true };
  });

  ipcMain.handle('folder:move-session', (_event, sessionId: string, folderId: string | null) => {
    databaseService.moveSession(sessionId, folderId);
    return { ok: true };
  });

  ipcMain.handle('search:query', (_event, term: string) => {
    return databaseService.search(term);
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
  ipcMain.handle('config:get', () => {
    return configService.getAll();
  });

  ipcMain.handle('config:set', (_event, key: string, value: any) => {
    configService.set(key, value);
    // Live-update LLM config when relevant keys change
    if (key.startsWith('llm.')) {
      const llmCfg = configService.get('llm');
      llmService.setLlmConfig({
        contextSize: llmCfg.contextSize,
        temperature: llmCfg.temperature,
      });
    }
    return { ok: true };
  });

  ipcMain.handle('config:reset', () => {
    configService.reset();
    databaseService.clearAll();
    // Delete all downloaded models
    for (const subdir of ['llm', 'vad', 'stt']) {
      const dir = join(modelsDir, subdir);
      if (existsSync(dir)) {
        for (const file of readdirSync(dir)) {
          rmSync(join(dir, file), { force: true });
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

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    setDockIcon();
  }


  // Create windows
  createMainWindow();
  // Widget disabled: createWidgetWindow();
  createTray();

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
