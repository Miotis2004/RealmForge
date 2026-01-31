import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase.config';
import { AUTH, FIRESTORE } from './firebase.tokens';
import { SeedService } from './core/services/seed.service';

const app = initializeApp(firebaseConfig);

const seedInitializer = (seedService: SeedService) => () => {
  seedService.maybeSeedFromAssets().catch((error) => {
    console.error('[SeedService] Initialization error', error);
  });
  return Promise.resolve();
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideHttpClient(),
    provideAnimationsAsync(),
    importProvidersFrom(MatSnackBarModule),
    { provide: AUTH, useFactory: () => getAuth(app) },
    { provide: FIRESTORE, useFactory: () => getFirestore(app) },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: seedInitializer,
      deps: [SeedService]
    }
  ]
};
