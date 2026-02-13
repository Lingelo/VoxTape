import { Route } from '@angular/router';
import { onboardingGuard } from './guards/onboarding.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
  },
  {
    path: 'widget',
    loadComponent: () =>
      import('./widget/widget.component').then((m) => m.WidgetComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./layout/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./layout/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
];
