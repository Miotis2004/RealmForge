import { Component, inject, OnInit, effect } from '@angular/core';
import { DmCardComponent } from './components/dm-card/dm-card.component';
import { CharacterCardComponent } from './components/character-card/character-card.component';
import { LogCardComponent } from './components/log-card/log-card.component';
import { DiceCardComponent } from './components/dice-card/dice-card.component';
import { OracleCardComponent } from './components/oracle-card/oracle-card.component';
import { AdventureEngineService } from './services/adventure-engine.service';
import { PersistenceService } from './services/persistence.service';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    DmCardComponent, 
    CharacterCardComponent, 
    LogCardComponent, 
    DiceCardComponent,
    OracleCardComponent,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    DragDropModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'realm-forge';
  adventure = inject(AdventureEngineService);
  persistence = inject(PersistenceService);

  // Define columns as a public property for the template
  columns: {id: string, items: string[]}[] = [
      {
          id: 'col-1',
          items: ['dm']
      },
      {
          id: 'col-2',
          items: ['character', 'dice', 'oracle', 'log']
      }
  ];

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

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }
  }
}
