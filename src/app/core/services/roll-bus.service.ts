import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type RollKind = 'initiative' | 'attack' | 'damage' | 'death_save' | 'generic';

export type RollRequest = {
  id: string;
  kind: RollKind;
  label: string;
  expression: string;
  modifier?: number;
  context?: { actor?: string; target?: string; source?: string };
  createdAt: number;
};

export type RollResult = {
  id: string;
  total: number;
  rolls: number[];
  modifier: number;
  expression: string;
  label: string;
  natural?: number;
  createdAt: number;
};

@Injectable({
  providedIn: 'root'
})
export class RollBusService {
  private requestSubject = new Subject<RollRequest>();
  readonly requests$ = this.requestSubject.asObservable();

  private resultSubject = new Subject<RollResult>();
  readonly results$ = this.resultSubject.asObservable();

  requestRoll(request: RollRequest): void {
    this.requestSubject.next(request);
  }

  publishResult(result: RollResult): void {
    this.resultSubject.next(result);
  }
}
