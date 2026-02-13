import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const onboardingGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const api = (window as any).sourdine?.config;
  if (!api) return true;

  const config = await api.get();
  if (!config.onboardingComplete) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};
