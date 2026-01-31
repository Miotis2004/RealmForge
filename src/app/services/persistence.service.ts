import { Injectable, inject, signal } from '@angular/core';
import { GameStateService } from './game-state.service';
import { GameState } from '../models/game-state.model';
import { AUTH, FIRESTORE } from '../firebase.tokens';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, serverTimestamp } from 'firebase/firestore';

type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
};

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private gameStateService = inject(GameStateService);
  private auth = inject(AUTH);
  private firestore = inject(FIRESTORE);

  readonly user = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly isAuthLoading = signal(true);
  readonly authError = signal<string | null>(null);

  constructor() {
     onAuthStateChanged(this.auth, (u) => {
         this.user.set(u);
         this.userProfile.set(null);
         this.isAuthLoading.set(false);
         if (u) {
           this.ensureUserProfile(u).catch((e) => console.error('User profile sync failed', e));
         }
     });
  }

  async signInWithGoogle() {
    this.authError.set(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      this.gameStateService.addLog({ type: 'info', message: 'Signed in with Google.', timestamp: Date.now() });
    } catch (e) {
      console.error('Sign in failed', e);
      this.authError.set(this.getErrorMessage(e));
      this.gameStateService.addLog({ type: 'info', message: 'Sign in failed.', timestamp: Date.now() });
    }
  }

  async checkForSave(): Promise<boolean> {
    const u = this.user();
    if (!u) return false;

    try {
        const snap = await getDoc(doc(this.firestore, 'users', u.uid, 'saves', 'latest'));
        return snap.exists();
    } catch (e) {
        console.error('Check save failed', e);
        return false;
    }
  }

  async signOut() {
    this.authError.set(null);
    try {
      await signOut(this.auth);
      this.gameStateService.addLog({ type: 'info', message: 'Signed out.', timestamp: Date.now() });
    } catch (e) {
      console.error('Sign out failed', e);
      this.authError.set(this.getErrorMessage(e));
      this.gameStateService.addLog({ type: 'info', message: 'Sign out failed.', timestamp: Date.now() });
    }
  }

  async saveGame() {
    const u = this.user();
    if (!u) {
         this.gameStateService.addLog({ type: 'info', message: 'Not logged in. Cannot save.', timestamp: Date.now() });
         return;
    }

    const state = this.gameStateService.getState();
    try {
      await setDoc(doc(this.firestore, 'users', u.uid, 'saves', 'latest'), state);
      this.gameStateService.addLog({ type: 'info', message: 'Game Saved to Cloud.', timestamp: Date.now() });
    } catch (e) {
      console.error('Save failed', e);
      this.gameStateService.addLog({ type: 'info', message: 'Failed to save game.', timestamp: Date.now() });
    }
  }

  async loadGame(): Promise<boolean> {
     const u = this.user();
     if (!u) return false;

     try {
         const snap = await getDoc(doc(this.firestore, 'users', u.uid, 'saves', 'latest'));
         if (snap.exists()) {
             const state = snap.data() as GameState;
             this.gameStateService.loadState(state);
             this.gameStateService.addLog({ type: 'info', message: 'Game Loaded from Cloud.', timestamp: Date.now() });
             return true;
         }
         return false;
     } catch (e) {
         console.error('Load failed', e);
         return false;
     }
  }

  async clearSave() {
      const u = this.user();
      if (!u) return;
      try {
          await deleteDoc(doc(this.firestore, 'users', u.uid, 'saves', 'latest'));
          this.gameStateService.addLog({ type: 'info', message: 'Save deleted.', timestamp: Date.now() });
      } catch (e) {
          console.error(e);
      }
  }

  private async ensureUserProfile(user: User): Promise<void> {
    const profileRef = doc(this.firestore, 'users', user.uid);
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as UserProfile;
      this.userProfile.set({
        uid: user.uid,
        email: data.email ?? user.email ?? null,
        displayName: data.displayName ?? user.displayName ?? null,
        isAdmin: Boolean(data.isAdmin)
      });
      return;
    }

    const isAdmin = await this.isFirstUser();
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      isAdmin
    };
    await setDoc(profileRef, { ...profile, createdAt: serverTimestamp() });
    this.userProfile.set(profile);
  }

  private async isFirstUser(): Promise<boolean> {
    const usersRef = collection(this.firestore, 'users');
    const snapshot = await getDocs(query(usersRef, limit(1)));
    return snapshot.empty;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: string }).message);
    }
    return 'Unknown authentication error.';
  }
}
