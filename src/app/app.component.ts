import { Component, inject, OnInit, effect } from '@angular/core';
import { DmCardComponent } from './components/dm-card/dm-card.component';
import { CharacterCardComponent } from './components/character-card/character-card.component';
import { LogCardComponent } from './components/log-card/log-card.component';
import { DiceCardComponent } from './components/dice-card/dice-card.component';
import { AdventureEngineService } from './services/adventure-engine.service';
import { PersistenceService } from './services/persistence.service';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    DmCardComponent, 
    CharacterCardComponent, 
    LogCardComponent, 
    DiceCardComponent,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'realm-forge';
  adventure = inject(AdventureEngineService);
  persistence = inject(PersistenceService);

  constructor() {
    effect(() => {
        const user = this.persistence.user();
        if (user) {
            this.persistence.loadGame().then(loaded => {
                if (loaded) {
                    // Update display after loading state
                    this.adventure.updateCurrentNode();
                }
            });
        }
    });
  }

  ngOnInit() {
    // Always load adventure data structure
    this.adventure.loadAdventure('assets/tutorial-dungeon.json'); 
  }

  saveGame() {
    this.persistence.saveGame();
  }
  
  newGame() {
    this.persistence.clearSave().then(() => {
        window.location.reload();
    });
  }
}
