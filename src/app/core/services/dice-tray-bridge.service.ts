import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DiceRollRequest, DiceRollResult } from '../models/dice-roll';

@Injectable({
  providedIn: 'root'
})
export class DiceTrayBridgeService {
  private pendingRollSignal = signal<DiceRollRequest | null>(null);
  private rollResultsSubject = new Subject<DiceRollResult>();

  readonly pendingRoll = this.pendingRollSignal.asReadonly();
  readonly rollResults$ = this.rollResultsSubject.asObservable();

  requestRoll(request: DiceRollRequest): void {
    this.pendingRollSignal.set(request);
  }

  resolveRoll(result: DiceRollResult): void {
    this.rollResultsSubject.next(result);
    this.pendingRollSignal.set(null);
  }

  clearPending(): void {
    this.pendingRollSignal.set(null);
  }
}
