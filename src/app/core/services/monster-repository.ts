import { Injectable, inject } from '@angular/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { combineLatest, Observable, of } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { Monster } from '../models/adventure-models';
import { FIRESTORE } from '../../firebase.tokens';

@Injectable({
  providedIn: 'root'
})
export class MonsterRepository {
  private firestore = inject(FIRESTORE);
  private cache = new Map<string, Observable<Monster | null>>();

  getMonster$(monsterId: string): Observable<Monster | null> {
    const cached = this.cache.get(monsterId);
    if (cached) {
      return cached;
    }

    const docRef = doc(this.firestore, 'monsters', monsterId);
    const monster$ = new Observable<Monster | null>((subscriber) => {
      return onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            subscriber.next(null);
            return;
          }
          const data = snap.data() as Record<string, unknown> | undefined;
          subscriber.next(data ? ({ id: snap.id, ...data } as Monster) : null);
        },
        (error) => subscriber.error(error)
      );
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    this.cache.set(monsterId, monster$);
    return monster$;
  }

  getMonsters$(monsterIds: string[]): Observable<Monster[]> {
    if (!monsterIds.length) {
      return of([]);
    }

    return combineLatest(monsterIds.map((id) => this.getMonster$(id))).pipe(
      map((monsters) => monsters.filter((monster): monster is Monster => monster !== null))
    );
  }
}
