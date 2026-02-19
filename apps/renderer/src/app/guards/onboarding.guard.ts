import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

interface VoxTapeConfigApi {
  config?: {
    get: () => Promise<{ onboardingComplete?: boolean }>;
  };
}

export const onboardingGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const api = (window as Window & { voxtape?: VoxTapeConfigApi }).voxtape?.config;
  if (!api) return true;

  const config = await api.get();
  if (!config.onboardingComplete) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};
