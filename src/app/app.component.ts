import { Component, inject, OnInit } from '@angular/core';
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

  ngOnInit() {
    // Attempt to load save, else load fresh adventure
    if (this.persistence.hasSave()) {
        this.persistence.loadGame();
    }
    
    // Always load adventure data structure (state stores node ID, but engine needs the graph)
    this.adventure.loadAdventure('assets/tutorial-dungeon.json'); 
  }

  saveGame() {
    this.persistence.saveGame();
  }
  
  newGame() {
    this.persistence.clearSave();
    window.location.reload(); // Simple way to reset state for now
  }
}
