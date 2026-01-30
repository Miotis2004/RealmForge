import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { AdventureEngineService } from '../../services/adventure-engine.service';
import { GameStateService } from '../../services/game-state.service';
import { CombatEngineService } from '../../services/combat-engine.service';

@Component({
  selector: 'app-dm-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './dm-card.component.html',
  styleUrl: './dm-card.component.scss'
})
export class DmCardComponent {
  adventure = inject(AdventureEngineService);
  gameState = inject(GameStateService);
  combatEngine = inject(CombatEngineService);
  
  options() {
    return this.adventure.getAvailableOptions();
  }
}
