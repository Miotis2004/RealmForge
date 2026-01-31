import { Component, inject, OnInit, effect } from '@angular/core';
import { DmCardComponent } from './components/dm-card/dm-card.component';
import { CharacterCardComponent } from './components/character-card/character-card.component';
import { LogCardComponent } from './components/log-card/log-card.component';
import { DiceCardComponent } from './components/dice-card/dice-card.component';
import { OracleCardComponent } from './components/oracle-card/oracle-card.component';
import { MainMenuDialogComponent } from './components/main-menu-dialog/main-menu-dialog.component';
import { AdventureEngineService } from './services/adventure-engine.service';
import { PersistenceService } from './services/persistence.service';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ContentImportService } from './core/services/content-import.service';
import { ImportJsonModalComponent } from './admin/import-json-modal';

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
    MatCheckboxModule,
    MatDialogModule,
    DragDropModule,
    ImportJsonModalComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'realm-forge';
  adventure = inject(AdventureEngineService);
  persistence = inject(PersistenceService);
  dialog = inject(MatDialog);
  contentImport = inject(ContentImportService);
  importOpen = false;

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
            this.persistence.checkForSave().then(hasSave => {
                const dialogRef = this.dialog.open(MainMenuDialogComponent, {
                    width: '400px',
                    disableClose: true,
                    data: { hasSave }
                });

                dialogRef.afterClosed().subscribe((result: 'continue' | 'new' | undefined) => {
                    if (result === 'continue') {
                        this.persistence.loadGame().then(loaded => {
                            if (loaded) {
                                this.adventure.updateCurrentNode();
                            }
                        });
                    } else if (result === 'new') {
                        this.adventure.startNewAdventure();
                    }
                });
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

  async signInWithGoogle() {
    await this.persistence.signInWithGoogle();
  }

  async signOut() {
    await this.persistence.signOut();
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

  async onImport(jsonText: string): Promise<void> {
    try {
      const result = await this.contentImport.importFromJsonText(jsonText);
      const summary =
        result.kind === 'bestiary'
          ? `Imported ${result.written} monsters.`
          : `Imported ${result.written} adventure records for ${result.adventureId ?? 'adventure'}.`;
      alert(summary);
      this.importOpen = false;
    } catch (error) {
      alert(this.getErrorMessage(error));
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: string }).message);
    }
    return 'Import failed.';
  }
}
