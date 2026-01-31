import { Component, inject, isDevMode } from '@angular/core';
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
    }),
    map((state) => {
      if (isDevMode() && state.status === 'ready') {
        const nodeRecord = state.node as Record<string, unknown>;
        const normalizedOptions = this.normalizeOptions(nodeRecord);
        // eslint-disable-next-line no-console
        console.log('Loaded node', nodeRecord['nodeId'], nodeRecord['type'], nodeRecord['options']);
        // eslint-disable-next-line no-console
        console.log('Normalized options', normalizedOptions);
      }
      return state;
    })
  );

  readonly normalizedOptions$ = this.nodeState$.pipe(
    map((state) => (state.status === 'ready' ? this.normalizeOptions(state.node) : []))
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

  nodeText(node: AdventureNode): string {
    const record = node as Record<string, unknown>;
    return this.getString(record, 'text') ?? this.getString(record, 'prompt') ?? '';
  }

  private normalizeOptions(node: unknown): NodeOptionNormalized[] {
    if (!this.isRecord(node)) {
      return [];
    }

    const options = node['options'];
    if (!Array.isArray(options)) {
      return [];
    }

    return options
      .filter(this.isRecord)
      .map((option) => {
        const label =
          this.getString(option, 'label') ??
          this.getString(option, 'text') ??
          this.getString(option, 'title') ??
          '(continue)';
        const targetNodeId =
          this.getString(option, 'targetNodeId') ??
          this.getString(option, 'nextNode') ??
          this.getString(option, 'next') ??
          this.getString(option, 'to');
        const actionType =
          this.getString(option, 'actionType') ?? 'navigation';

        return {
          label,
          targetNodeId: targetNodeId ?? '',
          actionType: actionType === 'navigation' ? 'navigation' : 'unknown'
        } satisfies NodeOptionNormalized;
      })
      .filter((option) => Boolean(option.targetNodeId));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }
}

type NodeState =
  | { status: 'idle' }
  | { status: 'loading'; nodeId: string }
  | { status: 'missing'; nodeId: string }
  | { status: 'ready'; node: AdventureNode };

type NodeOptionNormalized = {
  label: string;
  targetNodeId: string;
  actionType: 'navigation' | 'unknown';
};
