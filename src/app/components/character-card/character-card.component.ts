import { Component, inject } from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-character-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, MatProgressBarModule, KeyValuePipe],
  templateUrl: './character-card.component.html',
  styleUrl: './character-card.component.scss'
})
export class CharacterCardComponent {
  gameState = inject(GameStateService);
  
  get character() {
    return this.gameState.character();
  }

  hpPercentage() {
    return (this.character.hp / this.character.maxHp) * 100;
  }
}
