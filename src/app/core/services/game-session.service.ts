import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GameSessionService {
  readonly currentAdventureId = signal<string | null>(null);
  readonly currentNodeId = signal<string | null>(null);

  startNewGame(adventureId: string, startNodeId: string): void {
    this.currentAdventureId.set(adventureId);
    this.currentNodeId.set(startNodeId);
  }

  goToNode(nodeId: string): void {
    this.currentNodeId.set(nodeId);
  }

  reset(): void {
    this.currentAdventureId.set(null);
    this.currentNodeId.set(null);
  }
}
