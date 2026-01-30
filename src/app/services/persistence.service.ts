import { Injectable, inject } from '@angular/core';
import { GameStateService } from './game-state.service';
import { GameState } from '../models/game-state.model';

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private gameStateService = inject(GameStateService);
  private STORAGE_KEY = 'realm-forge-save-v1';

  saveGame() {
    const state = this.gameStateService.getState();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
      this.gameStateService.addLog({ type: 'info', message: 'Game Saved.', timestamp: Date.now() });
    } catch (e) {
      console.error('Save failed', e);
      this.gameStateService.addLog({ type: 'info', message: 'Failed to save game.', timestamp: Date.now() });
    }
  }

  loadGame(): boolean {
    const json = localStorage.getItem(this.STORAGE_KEY);
    if (!json) return false;

    try {
      const state = JSON.parse(json) as GameState;
      this.gameStateService.loadState(state);
      this.gameStateService.addLog({ type: 'info', message: 'Game Loaded.', timestamp: Date.now() });
      return true;
    } catch (e) {
      console.error('Load failed', e);
      return false;
    }
  }

  hasSave(): boolean {
    return !!localStorage.getItem(this.STORAGE_KEY);
  }
  
  clearSave() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
