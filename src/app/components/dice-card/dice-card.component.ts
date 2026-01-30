import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { AdventureEngineService } from '../../services/adventure-engine.service';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-dice-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './dice-card.component.html',
  styleUrl: './dice-card.component.scss'
})
export class DiceCardComponent {
  adventure = inject(AdventureEngineService);
  gameState = inject(GameStateService);
  rolling = signal(false);
  lastRoll = signal<number | null>(null);

  async rollDice() {
    if (this.rolling()) return;

    this.rolling.set(true);
    this.lastRoll.set(null);

    // Simulate animation delay
    // In a real app, we'd have a CSS animation here
    await new Promise(resolve => setTimeout(resolve, 800));

    const result = Math.floor(Math.random() * 20) + 1;
    this.lastRoll.set(result);
    this.rolling.set(false);

    // Give the user a moment to see the result before moving on?
    // Or instant. Instant is fine for now, but maybe 500ms delay.
    await new Promise(resolve => setTimeout(resolve, 500));

    this.adventure.resolvePendingRoll(result);
  }
}
