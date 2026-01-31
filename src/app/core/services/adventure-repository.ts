import { Injectable, inject } from '@angular/core';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { AdventureNode, AdventureSummary } from '../models/adventure-models';
import { FIRESTORE } from '../../firebase.tokens';

@Injectable({
  providedIn: 'root'
})
export class AdventureRepository {
  private firestore = inject(FIRESTORE);

  listPublishedAdventures(): Observable<AdventureSummary[]> {
    const collectionRef = collection(this.firestore, 'adventures');
    const listQuery = query(collectionRef, where('published', '==', true));

    return new Observable<AdventureSummary[]>((subscriber) => {
      return onSnapshot(
        listQuery,
        (snapshot) => {
          const adventures = snapshot.docs
            .map((snap) => this.mapAdventureSummary(snap.id, snap.data()))
            .filter((item): item is AdventureSummary => item !== null)
            .sort((a, b) => a.title.localeCompare(b.title));
          subscriber.next(adventures);
        },
        (error) => subscriber.error(error)
      );
    });
  }

  getAdventure$(adventureId: string): Observable<AdventureSummary | null> {
    const docRef = doc(this.firestore, 'adventures', adventureId);
    return new Observable<AdventureSummary | null>((subscriber) => {
      return onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            subscriber.next(null);
            return;
          }
          subscriber.next(this.mapAdventureSummary(snap.id, snap.data()));
        },
        (error) => subscriber.error(error)
      );
    });
  }

  getNode$(adventureId: string, nodeId: string): Observable<AdventureNode | null> {
    const docRef = doc(this.firestore, `adventures/${adventureId}/nodes/${nodeId}`);
    return new Observable<AdventureNode | null>((subscriber) => {
      return onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            subscriber.next(null);
            return;
          }
          const data = snap.data() as Record<string, unknown> | undefined;
          subscriber.next(data ? ({ nodeId: snap.id, ...data } as AdventureNode) : null);
        },
        (error) => subscriber.error(error)
      );
    });
  }

  private mapAdventureSummary(
    id: string,
    data: Record<string, unknown> | undefined
  ): AdventureSummary | null {
    if (!data) {
      return null;
    }
    return {
      adventureId: id,
      title: String(data['title'] ?? data['name'] ?? 'Untitled Adventure'),
      name: typeof data['name'] === 'string' ? data['name'] : undefined,
      description: typeof data['description'] === 'string' ? data['description'] : undefined,
      published: Boolean(data['published']),
      version: typeof data['version'] === 'number' ? data['version'] : undefined,
      startNodeId: typeof data['startNodeId'] === 'string' ? data['startNodeId'] : undefined
    };
  }
}
