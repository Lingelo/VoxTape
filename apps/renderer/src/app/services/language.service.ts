import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

interface SourdineConfigApi {
  config?: {
    get: () => Promise<{ language?: string }>;
    set: (key: string, value: string | boolean | number | null) => Promise<void>;
  };
}

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly _currentLang$ = new BehaviorSubject<SupportedLanguage>('fr');

  readonly currentLang$ = this._currentLang$.asObservable();

  get currentLang(): SupportedLanguage {
    return this._currentLang$.value;
  }

  private get sourdineApi(): SourdineConfigApi | undefined {
    return (window as Window & { sourdine?: SourdineConfigApi }).sourdine;
  }

  async init(): Promise<void> {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setDefaultLang('fr');

    // Load saved language from config
    const api = this.sourdineApi?.config;
    if (api) {
      try {
        const cfg = await api.get();
        const savedLang = cfg.language as SupportedLanguage;
        if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang)) {
          this.setLanguage(savedLang, false);
          return;
        }
      } catch {
        // Config not ready yet, use default
      }
    }

    // Fallback: detect browser language
    const browserLang = navigator.language.slice(0, 2);
    if (SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)) {
      this.setLanguage(browserLang as SupportedLanguage, false);
    } else {
      this.setLanguage('fr', false);
    }
  }

  setLanguage(lang: SupportedLanguage, persist = true): void {
    this.translate.use(lang);
    this._currentLang$.next(lang);

    if (persist) {
      this.saveLanguage(lang);
    }
  }

  private async saveLanguage(lang: SupportedLanguage): Promise<void> {
    const api = this.sourdineApi?.config;
    if (api) {
      await api.set('language', lang);
    }
  }
}
