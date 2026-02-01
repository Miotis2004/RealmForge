import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { rollDice } from '../../core/dnd/dice';
import { RollBusService, RollRequest, RollResult } from '../../core/services/roll-bus.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-dice-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './dice-card.component.html',
  styleUrl: './dice-card.component.scss'
})
export class DiceCardComponent {
  rollBus = inject(RollBusService);
  currentRequest = signal<RollRequest | null>(null);
  rolling = signal(false);
  lastRoll = signal<number | null>(null);

  constructor() {
    this.rollBus.requests$
      .pipe(takeUntilDestroyed())
      .subscribe(request => {
        this.currentRequest.set(request);
        this.lastRoll.set(null);
      });
  }

  async rollDice() {
    if (this.rolling()) return;
    const pending = this.currentRequest();
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

    this.rollBus.publishResult(this.buildResult(pending, result));
    window.setTimeout(() => {
      if (this.currentRequest()?.id === pending.id) {
        this.currentRequest.set(null);
        this.lastRoll.set(null);
      }
    }, 250);
  }

  private buildResult(request: RollRequest, result: ReturnType<typeof rollDice>): RollResult {
    const normalized = request.expression.replace(/\s+/g, '').toLowerCase();
    const natural = this.isSingleD20(normalized) ? result.rolls[0] : undefined;
    return {
      id: request.id,
      total: result.total,
      rolls: result.rolls,
      modifier: result.modifier,
      expression: request.expression,
      label: request.label,
      natural,
      createdAt: Date.now()
    };
  }

  private isSingleD20(expression: string): boolean {
    return /^1d20([+-]\d+)?$/.test(expression);
  }
}
