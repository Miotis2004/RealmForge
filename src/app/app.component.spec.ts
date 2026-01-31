import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideExperimentalZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { PersistenceService } from './services/persistence.service';
import { AdventureEngineService } from './services/adventure-engine.service';
import { DragDropModule } from '@angular/cdk/drag-drop';

describe('AppComponent', () => {
  beforeEach(async () => {
    const persistenceMock = {
        user: signal(null),
        isAuthLoading: signal(false),
        authError: signal(null),
        loadGame: jasmine.createSpy('loadGame').and.returnValue(Promise.resolve(false)),
        saveGame: jasmine.createSpy('saveGame'),
        clearSave: jasmine.createSpy('clearSave').and.returnValue(Promise.resolve()),
        hasSave: jasmine.createSpy('hasSave').and.returnValue(false),
        signIn: jasmine.createSpy('signIn').and.returnValue(Promise.resolve()),
        signUp: jasmine.createSpy('signUp').and.returnValue(Promise.resolve()),
        signOut: jasmine.createSpy('signOut').and.returnValue(Promise.resolve())
    };

    const adventureMock = {
        loadAdventure: jasmine.createSpy('loadAdventure'),
        updateCurrentNode: jasmine.createSpy('updateCurrentNode'),
        currentDisplayNode: signal(null),
        isLoading: signal(false),
        pendingRoll: signal(null),
        getAvailableOptions: () => [],
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
          provideExperimentalZonelessChangeDetection(),
          provideHttpClient(),
          provideAnimationsAsync(),
          { provide: PersistenceService, useValue: persistenceMock },
          { provide: AdventureEngineService, useValue: adventureMock }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'realm-forge' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('realm-forge');
  });

  it('should render title in toolbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar span')?.textContent).toContain('Realm Forge');
  });
});
