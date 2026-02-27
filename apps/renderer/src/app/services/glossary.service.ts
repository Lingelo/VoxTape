import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface GlossaryEntry {
  from: string;
  to: string;
}

interface VoxTapeConfigApi {
  config?: {
    get: () => Promise<{ glossary?: { entries: GlossaryEntry[] } }>;
    set: (key: string, value: unknown) => Promise<void>;
  };
}

@Injectable({ providedIn: 'root' })
export class GlossaryService {
  private readonly _entries$ = new BehaviorSubject<GlossaryEntry[]>([]);
  private readonly ngZone = inject(NgZone);
  private compiledRegex: RegExp | null = null;
  private replacementMap = new Map<string, string>();

  readonly entries$: Observable<GlossaryEntry[]> = this._entries$.asObservable();

  constructor() {
    this.loadFromConfig();
  }

  get entries(): GlossaryEntry[] {
    return this._entries$.value;
  }

  applyReplacements(text: string): string {
    if (!this.compiledRegex || this._entries$.value.length === 0) return text;
    return text.replace(this.compiledRegex, (match) => {
      return this.replacementMap.get(match.toLowerCase()) ?? match;
    });
  }

  async addEntry(from: string, to: string): Promise<void> {
    if (!from.trim() || !to.trim()) return;
    const entries = [...this._entries$.value, { from: from.trim(), to: to.trim() }];
    this._entries$.next(entries);
    this.compileRegex(entries);
    await this.persistEntries(entries);
  }

  async removeEntry(index: number): Promise<void> {
    const entries = this._entries$.value.filter((_, i) => i !== index);
    this._entries$.next(entries);
    this.compileRegex(entries);
    await this.persistEntries(entries);
  }

  async updateEntry(index: number, from: string, to: string): Promise<void> {
    const entries = [...this._entries$.value];
    entries[index] = { from: from.trim(), to: to.trim() };
    this._entries$.next(entries);
    this.compileRegex(entries);
    await this.persistEntries(entries);
  }

  private compileRegex(entries: GlossaryEntry[]): void {
    if (entries.length === 0) {
      this.compiledRegex = null;
      this.replacementMap.clear();
      return;
    }

    this.replacementMap.clear();
    const patterns: string[] = [];

    for (const entry of entries) {
      const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push(`\\b${escaped}\\b`);
      this.replacementMap.set(entry.from.toLowerCase(), entry.to);
    }

    this.compiledRegex = new RegExp(patterns.join('|'), 'gi');
  }

  private get voxtapeApi(): VoxTapeConfigApi | undefined {
    return (window as Window & { voxtape?: VoxTapeConfigApi }).voxtape;
  }

  private async loadFromConfig(): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (!api) {
      // Retry after preload is ready
      setTimeout(() => this.loadFromConfig(), 500);
      return;
    }

    try {
      const cfg = await api.get();
      const entries = cfg?.glossary?.entries ?? [];
      this.ngZone.run(() => {
        this._entries$.next(entries);
        this.compileRegex(entries);
      });
    } catch {
      // Config not ready yet
    }
  }

  private async persistEntries(entries: GlossaryEntry[]): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (!api) return;
    await api.set('glossary', { entries });
  }
}
