import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AdventureRepository } from '../core/services/adventure-repository';

@Component({
  selector: 'rf-adventure-select-modal',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule],
  templateUrl: './adventure-select-modal.html',
  styleUrls: ['./adventure-select-modal.scss']
})
export class AdventureSelectModalComponent {
  private adventureRepository = inject(AdventureRepository);

  @Input({ required: true }) open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();

  readonly adventures$ = this.adventureRepository.listPublishedAdventures();

  close(): void {
    this.closed.emit();
  }

  selectAdventure(adventureId: string): void {
    this.selected.emit(adventureId);
  }
}
