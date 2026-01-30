import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-log-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, DatePipe],
  templateUrl: './log-card.component.html',
  styleUrl: './log-card.component.scss'
})
export class LogCardComponent {
  gameState = inject(GameStateService);
  
  get logs() {
    return this.gameState.gameLog();
  }
}
