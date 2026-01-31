import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'rf-import-json-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open) {
      <div class="modal-backdrop" (click)="onBackdropClick($event)">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <header>
            <h2>Import JSON</h2>
          </header>
          <section class="modal-content">
            <label class="file-input">
              Load JSON file
              <input type="file" accept=".json" (change)="onFileSelected($event)" />
            </label>
            <textarea
              [(ngModel)]="jsonText"
              placeholder="Paste JSON here"
              rows="14"
            ></textarea>
            <div class="button-row">
              <button type="button" (click)="formatJson()">Format</button>
              <button type="button" (click)="clearJson()">Clear</button>
              <button type="button" (click)="close()">Cancel</button>
              <button type="button" class="primary" [disabled]="!jsonText.trim()" (click)="importJson()">
                Import
              </button>
            </div>
            @if (statusMessage) {
              <div class="status-block">{{ statusMessage }}</div>
            }
            @if (errorMessage) {
              <div class="error-block">{{ errorMessage }}</div>
            }
          </section>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .modal-panel {
        background: #1f1f1f;
        color: #f5f5f5;
        padding: 24px;
        width: min(720px, 90vw);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
      }

      header h2 {
        margin: 0 0 16px;
      }

      .modal-content {
        display: grid;
        gap: 16px;
      }

      .file-input {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.95rem;
      }

      textarea {
        width: 100%;
        resize: vertical;
        min-height: 220px;
        background: #111;
        color: #f5f5f5;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, SFMono, Menlo, Consolas, monospace;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: flex-end;
      }

      button {
        background: #2f2f2f;
        color: #f5f5f5;
        border: 1px solid #555;
        padding: 8px 14px;
        border-radius: 6px;
        cursor: pointer;
      }

      button.primary {
        background: #4a7cff;
        border-color: #4a7cff;
      }

      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .status-block {
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(76, 175, 80, 0.15);
        border: 1px solid rgba(76, 175, 80, 0.4);
      }

      .error-block {
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(244, 67, 54, 0.15);
        border: 1px solid rgba(244, 67, 54, 0.4);
        color: #f3c6c6;
      }
    `
  ]
})
export class ImportJsonModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() imported = new EventEmitter<string>();

  jsonText = '';
  statusMessage = '';
  errorMessage = '';

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.jsonText = typeof reader.result === 'string' ? reader.result : '';
      this.statusMessage = 'File loaded.';
      this.errorMessage = '';
    };
    reader.onerror = () => {
      this.errorMessage = 'Failed to read file.';
      this.statusMessage = '';
    };
    reader.readAsText(file);
  }

  formatJson(): void {
    if (!this.jsonText.trim()) {
      this.errorMessage = 'Paste JSON to format.';
      this.statusMessage = '';
      return;
    }

    try {
      const parsed = JSON.parse(this.jsonText);
      this.jsonText = JSON.stringify(parsed, null, 2);
      this.statusMessage = 'JSON formatted.';
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'Invalid JSON.');
      this.statusMessage = '';
    }
  }

  clearJson(): void {
    this.jsonText = '';
    this.statusMessage = 'Cleared.';
    this.errorMessage = '';
  }

  importJson(): void {
    this.statusMessage = 'Import requested.';
    this.errorMessage = '';
    this.imported.emit(this.jsonText);
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(_event: Event): void {
    this.close();
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: string }).message);
    }
    return fallback;
  }
}
