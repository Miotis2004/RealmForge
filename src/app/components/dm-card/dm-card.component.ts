import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { AdventureRepository } from '../../core/services/adventure-repository';
import { GameSessionService } from '../../core/services/game-session.service';
import { MonsterRepository } from '../../core/services/monster-repository';
import { AdventureNode } from '../../core/models/adventure-models';

@Component({
  selector: 'app-dm-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './dm-card.component.html',
  styleUrl: './dm-card.component.scss'
})
export class DmCardComponent {
  private adventureRepository = inject(AdventureRepository);
  private gameSession = inject(GameSessionService);
  private monsterRepository = inject(MonsterRepository);

  private adventureId$ = toObservable(this.gameSession.currentAdventureId);
  private nodeId$ = toObservable(this.gameSession.currentNodeId);

  readonly nodeState$ = combineLatest([this.adventureId$, this.nodeId$]).pipe(
    switchMap(([adventureId, nodeId]) => {
      if (!adventureId || !nodeId) {
        return of({ status: 'idle' as const });
      }

      return this.adventureRepository.getNode$(adventureId, nodeId).pipe(
        map((node) =>
          node
            ? ({ status: 'ready' as const, node } satisfies NodeState)
            : ({ status: 'missing' as const, nodeId } satisfies NodeState)
        ),
        startWith({ status: 'loading' as const, nodeId })
      );
    })
  );

  readonly monsters$ = this.nodeState$.pipe(
    map((state) => (state.status === 'ready' ? state.node : null)),
    switchMap((node) => {
      const ids = node?.monsterIds ?? [];
      return ids.length ? this.monsterRepository.getMonsters$(ids) : of([]);
    })
  );

  goToNode(nodeId: string): void {
    this.gameSession.goToNode(nodeId);
  }

  resetSession(): void {
    this.gameSession.reset();
  }
}

type NodeState =
  | { status: 'idle' }
  | { status: 'loading'; nodeId: string }
  | { status: 'missing'; nodeId: string }
  | { status: 'ready'; node: AdventureNode };
