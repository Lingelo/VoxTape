import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type TooltipStep = 'record' | 'transcript' | 'generate' | 'done';

interface SourdineConfigApi {
  config?: {
    get: () => Promise<{ firstLaunchComplete?: boolean }>;
    set: (key: string, value: boolean) => Promise<void>;
  };
}

@Injectable({ providedIn: 'root' })
export class FirstLaunchService {
  private readonly _currentStep$ = new BehaviorSubject<TooltipStep | null>(null);
  private readonly _isFirstLaunch$ = new BehaviorSubject<boolean>(false);

  readonly currentStep$: Observable<TooltipStep | null> = this._currentStep$.asObservable();
  readonly isFirstLaunch$: Observable<boolean> = this._isFirstLaunch$.asObservable();

  private get api(): SourdineConfigApi['config'] | undefined {
    return (window as Window & { sourdine?: SourdineConfigApi }).sourdine?.config;
  }

  async checkFirstLaunch(): Promise<void> {
    try {
      const config = await this.api?.get();
      if (!config?.firstLaunchComplete) {
        this._isFirstLaunch$.next(true);
        this._currentStep$.next('record');
      }
    } catch {
      // Ignore errors - assume not first launch
    }
  }

  get currentStep(): TooltipStep | null {
    return this._currentStep$.value;
  }

  nextStep(): void {
    const current = this._currentStep$.value;
    switch (current) {
      case 'record':
        this._currentStep$.next('transcript');
        break;
      case 'transcript':
        this._currentStep$.next('generate');
        break;
      case 'generate':
        this.complete();
        break;
    }
  }

  skipAll(): void {
    this.complete();
  }

  private async complete(): Promise<void> {
    this._currentStep$.next('done');
    this._isFirstLaunch$.next(false);
    try {
      await this.api?.set('firstLaunchComplete', true);
    } catch {
      // Ignore save errors
    }
  }
}
