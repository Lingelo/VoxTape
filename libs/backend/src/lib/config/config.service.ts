import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface SourdineConfig {
  language: string;
  theme: 'dark' | 'light' | 'system';
  audio: {
    defaultDeviceId: string | null;
  };
  llm: {
    modelPath: string | null;
    contextSize: number;
    temperature: number;
  };
  stt: {
    modelPath: string | null;
  };
  onboardingComplete: boolean;
}

const DEFAULT_CONFIG: SourdineConfig = {
  language: 'fr',
  theme: 'dark',
  audio: { defaultDeviceId: null },
  llm: { modelPath: null, contextSize: 4096, temperature: 0.7 },
  stt: { modelPath: null },
  onboardingComplete: false,
};

@Injectable()
export class ConfigService {
  private configPath = '';
  private config: SourdineConfig = { ...DEFAULT_CONFIG };

  open(userDataPath: string): void {
    this.configPath = join(userDataPath, 'sourdine-config.json');
    this.load();
  }

  private load(): void {
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf-8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {
        this.config = { ...DEFAULT_CONFIG };
      }
    } else {
      this.config = { ...DEFAULT_CONFIG };
      this.save();
    }
  }

  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  getAll(): SourdineConfig {
    return { ...this.config };
  }

  get<K extends keyof SourdineConfig>(key: K): SourdineConfig[K] {
    return this.config[key];
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  set(key: string, value: any): void {
    const keys = key.split('.');
    let obj: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }
}
