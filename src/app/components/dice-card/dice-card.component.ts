import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { DiceTrayBridgeService } from '../../core/services/dice-tray-bridge.service';
import { rollDice } from '../../core/dnd/dice';
import { DiceRollResult } from '../../core/models/dice-roll';

@Component({
  selector: 'app-dice-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './dice-card.component.html',
  styleUrl: './dice-card.component.scss'
})
export class DiceCardComponent {
  diceTray = inject(DiceTrayBridgeService);
  rolling = signal(false);
  lastRoll = signal<number | null>(null);

  constructor() {
    effect(() => {
      if (!this.diceTray.pendingRoll()) {
        this.lastRoll.set(null);
      }
    });
  }

  async rollDice() {
    if (this.rolling()) return;
    const pending = this.diceTray.pendingRoll();
    if (!pending) return;

    this.rolling.set(true);
    this.lastRoll.set(null);

    // Simulate animation delay
    // In a real app, we'd have a CSS animation here
    await new Promise(resolve => setTimeout(resolve, 800));

    const result = rollDice(pending.expression, pending.modifier ?? 0);
    this.lastRoll.set(result.total);
    this.rolling.set(false);

    // Give the user a moment to see the result before moving on?
    // Or instant. Instant is fine for now, but maybe 500ms delay.
    await new Promise(resolve => setTimeout(resolve, 500));

    this.diceTray.resolveRoll(this.buildResult(pending.id, pending.expression, result));
  }

  private buildResult(id: string, expression: string, result: ReturnType<typeof rollDice>): DiceRollResult {
    const normalized = expression.replace(/\s+/g, '').toLowerCase();
    const natural = this.isSingleD20(normalized) ? result.rolls[0] : undefined;
    return {
      id,
      total: result.total,
      rolls: result.rolls,
      natural
    };
  }

  private isSingleD20(expression: string): boolean {
    return /^1d20([+-]\d+)?$/.test(expression);
  }
}
