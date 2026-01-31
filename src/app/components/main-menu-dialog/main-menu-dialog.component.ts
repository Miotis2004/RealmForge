import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface MainMenuDialogData {
  hasSave: boolean;
}

@Component({
  selector: 'app-main-menu-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './main-menu-dialog.component.html',
  styleUrls: ['./main-menu-dialog.component.scss']
})
export class MainMenuDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<MainMenuDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MainMenuDialogData
  ) {}

  onNewGame() {
    this.dialogRef.close('new');
  }

  onContinue() {
    this.dialogRef.close('continue');
  }
}
