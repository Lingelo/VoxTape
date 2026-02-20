import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { existsSync, readdirSync, rmSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import { createWriteStream } from 'fs';

const execFileAsync = promisify(execFile);

export interface ModelInfo {
  id: string;
  name: string;
  type: 'stt' | 'llm' | 'vad' | 'diarization';
  url: string;
  size: string;
  description: string;
  filename: string;
  /** For archive models: file to check to determine if installed */
  checkFile?: string;
  /** For archive models: whether the download is a tar.bz2 archive */
  archive?: boolean;
}

export interface DownloadedModel {
  id: string;
  name: string;
  type: string;
  path: string;
  sizeBytes: number;
}

const KNOWN_MODELS: ModelInfo[] = [
  {
    id: 'silero-vad',
    name: 'Silero VAD',
    type: 'vad',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    size: '~2 Mo',
    description: 'Détection de voix (Voice Activity Detection)',
    filename: 'silero_vad.onnx',
  },
  {
    id: 'whisper-small',
    name: 'Whisper small (int8)',
    type: 'stt',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2',
    size: '~460 Mo',
    description: 'Transcription multilingue - excellent français (OpenAI)',
    filename: 'sherpa-onnx-whisper-small.tar.bz2',
    checkFile: 'small-encoder.int8.onnx',
    archive: true,
  },
  {
    id: 'ministral-3b-instruct-q4',
    name: 'Ministral 3B Instruct (Q4_K_M)',
    type: 'llm',
    url: 'https://huggingface.co/bartowski/mistralai_Ministral-3-3B-Instruct-2512-GGUF/resolve/main/mistralai_Ministral-3-3B-Instruct-2512-Q4_K_M.gguf',
    size: '~2.1 Go',
    description: 'Assistant IA local rapide (résumés, chat) — recommandé',
    filename: 'mistralai_Ministral-3-3B-Instruct-2512-Q4_K_M.gguf',
  },
  // Diarization models disabled - too slow for real-time use
  // {
  //   id: 'pyannote-segmentation-3',
  //   name: 'Pyannote Segmentation 3.0',
  //   type: 'diarization',
  //   ...
  // },
  // {
  //   id: '3dspeaker-embedding',
  //   name: '3D-Speaker Embedding',
  //   type: 'diarization',
  //   ...
  // },
];

@Injectable()
export class ModelManagerService extends EventEmitter {
  private modelsDir = '';

  setModelsDir(path: string): void {
    this.modelsDir = path;
    mkdirSync(join(this.modelsDir, 'llm'), { recursive: true });
    mkdirSync(join(this.modelsDir, 'stt'), { recursive: true });
    mkdirSync(join(this.modelsDir, 'vad'), { recursive: true });
    mkdirSync(join(this.modelsDir, 'diarization'), { recursive: true });
  }

  listKnown(): ModelInfo[] {
    return KNOWN_MODELS;
  }

  listDownloaded(): DownloadedModel[] {
    const result: DownloadedModel[] = [];

    for (const model of KNOWN_MODELS) {
      const subdir = this.subdirForModel(model);
      const fileToCheck = model.checkFile || model.filename;
      const filePath = join(this.modelsDir, subdir, fileToCheck);

      if (!existsSync(filePath)) continue;

      try {
        const stat = statSync(filePath);
        if (stat.isFile()) {
          result.push({
            id: model.id,
            name: model.name,
            type: model.type,
            path: filePath,
            sizeBytes: stat.size,
          });
        }
      } catch {
        // skip
      }
    }

    return result;
  }

  async download(modelId: string): Promise<void> {
    const model = KNOWN_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const subdir = this.subdirForModel(model);
    const fileToCheck = model.checkFile || model.filename;
    const checkPath = join(this.modelsDir, subdir, fileToCheck);

    if (existsSync(checkPath)) {
      this.emit('download-progress', { modelId, progress: 1, total: 1 });
      return;
    }

    const destPath = join(this.modelsDir, subdir, model.filename);

    await this.downloadFile(model.url, destPath, modelId);

    // Extract archive if needed
    if (model.archive) {
      await this.extractArchive(destPath, subdir);
      rmSync(destPath, { force: true });
    }
  }

  deleteModel(modelId: string): void {
    const model = KNOWN_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    const subdir = this.subdirForModel(model);
    const dir = join(this.modelsDir, subdir);

    if (model.archive) {
      // Delete all files in the subdirectory for archive models
      if (existsSync(dir)) {
        for (const file of readdirSync(dir)) {
          rmSync(join(dir, file), { force: true });
        }
      }
    } else {
      const filePath = join(dir, model.filename);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
    }
  }

  private subdirForModel(model: ModelInfo): string {
    if (model.type === 'vad') return 'vad';
    if (model.type === 'llm') return 'llm';
    if (model.type === 'diarization') return 'diarization';
    return 'stt';
  }

  private downloadFile(url: string, destPath: string, modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmpPath = destPath + '.tmp';
      const file = createWriteStream(tmpPath);

      const doRequest = (requestUrl: string) => {
        https.get(requestUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            const location = response.headers.location;
            if (location) {
              doRequest(location);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          const total = parseInt(response.headers['content-length'] || '0', 10);
          let downloaded = 0;

          response.on('data', (chunk) => {
            downloaded += chunk.length;
            this.emit('download-progress', { modelId, progress: downloaded, total });
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            renameSync(tmpPath, destPath);
            resolve();
          });
        }).on('error', (err) => {
          try { rmSync(tmpPath, { force: true }); } catch {}
          reject(err);
        });
      };

      doRequest(url);
    });
  }

  private async extractArchive(archivePath: string, subdir: string): Promise<void> {
    const destDir = join(this.modelsDir, subdir);
    const tmpDir = join(this.modelsDir, '_extract_tmp');

    try {
      mkdirSync(tmpDir, { recursive: true });
      // Use async execFile to prevent blocking the main thread during extraction
      await execFileAsync('tar', ['-xjf', archivePath, '-C', tmpDir], { timeout: 120000 });

      // Find extracted directory and move relevant files
      const entries = readdirSync(tmpDir);
      for (const entry of entries) {
        const entryPath = join(tmpDir, entry);
        const entryStat = statSync(entryPath);

        if (entryStat.isDirectory()) {
          // Move .onnx and .txt files from extracted dir to destination
          for (const file of readdirSync(entryPath)) {
            if (file.endsWith('.onnx') || file.endsWith('.txt')) {
              renameSync(join(entryPath, file), join(destDir, file));
            }
          }
        } else if (entry.endsWith('.onnx') || entry.endsWith('.txt')) {
          renameSync(entryPath, join(destDir, entry));
        }
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
