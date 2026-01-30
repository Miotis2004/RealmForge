import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-oracle-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './oracle-card.component.html',
  styleUrl: './oracle-card.component.scss'
})
export class OracleCardComponent {
  private gameState = inject(GameStateService);

  lastAnswer: string | null = null;

  ask(odds: 'likely' | 'unlikely' | '50/50') {
    const roll = Math.random();
    let result = '';

    // Logic inspired by typical solo RPG oracles (e.g. Mythic)
    // 50/50: < 0.5 Yes, > 0.5 No
    // Likely: < 0.75 Yes, > 0.25 No
    // Unlikely: < 0.25 Yes, > 0.75 No

    // Adding "And/But" modifiers for criticals (top/bottom 10% of range)

    let threshold = 0.5;
    if (odds === 'likely') threshold = 0.75;
    if (odds === 'unlikely') threshold = 0.25;

    const isYes = roll <= threshold;

    // Critical factor relative to the success range
    // If Yes, and roll is very low (top 10% of success range) -> Yes, and...
    // If Yes, and roll is very high (bottom 10% of success range) -> Yes, but...
    // If No...

    // Simplified for prototype:
    if (isYes) {
        if (roll < threshold * 0.2) result = 'YES, and...';
        else if (roll > threshold * 0.8) result = 'YES, but...';
        else result = 'YES';
    } else {
        // No range is (threshold to 1.0)
        const noRange = 1.0 - threshold;
        const relativeRoll = roll - threshold;

        if (relativeRoll < noRange * 0.2) result = 'NO, but...';
        else if (relativeRoll > noRange * 0.8) result = 'NO, and...';
        else result = 'NO';
    }

    this.lastAnswer = result;

    this.gameState.addLog({
        type: 'info',
        message: `Oracle (${odds}): ${result}`,
        timestamp: Date.now()
    });
  }
}
