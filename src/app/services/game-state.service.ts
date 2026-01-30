import { Injectable, signal, computed } from '@angular/core';
import { GameState, LogEntry } from '../models/game-state.model';
import { Character } from '../models/character.model';

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  
  // Define signals
  readonly character = signal<Character>(this.getInitialCharacter());
  readonly currentNodeId = signal<string>('scene_01_start');
  readonly gameLog = signal<LogEntry[]>([]);
  readonly tags = signal<string[]>([]);

  // Computed state
  readonly isDead = computed(() => this.character().hp <= 0);

  constructor() {
    // Initialize tags with character tags
    this.tags.set([...this.character().tags]);
  }

  // Actions
  updateHp(delta: number) {
    this.character.update(c => {
      const newHp = Math.min(c.maxHp, Math.max(0, c.hp + delta));
      return { ...c, hp: newHp };
    });
    this.addLog({
      type: 'info',
      message: delta > 0 ? `Healed for ${delta} HP.` : `Took ${Math.abs(delta)} damage.`,
      timestamp: Date.now()
    });
  }

  setNode(nodeId: string) {
    this.currentNodeId.set(nodeId);
  }

  addLog(entry: LogEntry) {
    this.gameLog.update(log => [entry, ...log]); // Newest first
  }
  
  addTag(tag: string) {
    this.tags.update(tags => {
        if (!tags.includes(tag)) return [...tags, tag];
        return tags;
    });
  }

  hasTag(tag: string): boolean {
    return this.tags().includes(tag);
  }

  // Helper to reset state or load
  loadState(state: GameState) {
    this.character.set(state.character);
    this.currentNodeId.set(state.currentNodeId);
    this.gameLog.set(state.gameLog);
    this.tags.set(state.tags);
  }

  getState(): GameState {
    return {
      character: this.character(),
      currentNodeId: this.currentNodeId(),
      gameLog: this.gameLog(),
      tags: this.tags()
    };
  }

  private getInitialCharacter(): Character {
    return {
      name: 'Hero',
      race: 'Human',
      class: 'Fighter',
      level: 1,
      hp: 10,
      maxHp: 10,
      ac: 14,
      stats: {
        strength: 16,
        dexterity: 12,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 12
      },
      inventory: ['Longsword', 'Chain Mail'],
      tags: ['human', 'fighter']
    };
  }
}
