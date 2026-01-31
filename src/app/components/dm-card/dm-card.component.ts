import { Component, effect, inject, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, startWith, switchMap, tap } from 'rxjs';
import { AdventureRepository } from '../../core/services/adventure-repository';
import { GameSessionService } from '../../core/services/game-session.service';
import { MonsterRepository } from '../../core/services/monster-repository';
import { AdventureNode } from '../../core/models/adventure-models';
import { CombatService } from '../../core/services/combat.service';
import { GameStateService } from '../../services/game-state.service';
import { CombatState, HeroSnapshot } from '../../core/models/combat-models';
import { abilityMod } from '../../core/dnd/dice';

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
  private combatService = inject(CombatService);
  private gameState = inject(GameStateService);
  private lastAutoTurnKey: string | null = null;

  readonly combatState = this.combatService.state;

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

  constructor() {
    combineLatest([this.nodeState$, this.adventureId$])
      .pipe(
        tap(([state, adventureId]) => {
          if (state.status !== 'ready' || !adventureId) {
            return;
          }
          const isCombatNode = state.node.type === 'combat' || (state.node.monsterIds?.length ?? 0) > 0;
          if (isCombatNode) {
            void this.combatService.startCombat(adventureId, state.node, this.getHeroSnapshot());
          } else if (this.combatService.state()) {
            this.combatService.clearCombat();
          }
        }),
        takeUntilDestroyed()
      )
      .subscribe();

    effect(() => {
      const combat = this.combatService.state();
      if (!combat?.active) {
        this.lastAutoTurnKey = null;
        return;
      }
      this.scheduleMonsterTurn(combat);
    });
  }

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

  heroAttack(targetId: string): void {
    this.combatService.heroAttack(targetId);
  }

  endTurn(): void {
    this.combatService.endTurn();
  }

  isHeroTurn(combat: CombatState): boolean {
    return combat.order[combat.turnIndex]?.id === 'hero';
  }

  currentCombatant(combat: CombatState): CombatantView | null {
    const current = combat.order[combat.turnIndex];
    if (!current) return null;
    return {
      id: current.id,
      name: current.name,
      side: current.side,
      hp: current.hp,
      maxHp: current.maxHp,
      ac: current.ac,
      alive: current.alive,
      unconscious: current.unconscious ?? false,
      deathSaves: current.deathSaves
    };
  }

  visibleLog(combat: CombatState): string[] {
    return combat.log.slice(-8).map((entry) => entry.text);
  }

  combatantInitiative(combatant: CombatState['order'][number]): string {
    const dexMod = abilityMod(combatant.abilities.dex);
    return `${combatant.initiative} (DEX ${dexMod >= 0 ? '+' : ''}${dexMod})`;
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

  private getHeroSnapshot(): HeroSnapshot {
    const hero = this.gameState.character();
    return {
      name: hero.name,
      level: hero.level,
      hp: hero.hp,
      maxHp: hero.maxHp,
      ac: hero.ac,
      abilities: {
        str: hero.stats.strength,
        dex: hero.stats.dexterity,
        con: hero.stats.constitution,
        int: hero.stats.intelligence,
        wis: hero.stats.wisdom,
        cha: hero.stats.charisma
      }
    };
  }

  private scheduleMonsterTurn(combat: CombatState): void {
    const current = combat.order[combat.turnIndex];
    if (!current || current.side !== 'monster' || !current.alive) {
      return;
    }
    if (combat.awaitingPlayer) {
      return;
    }
    const key = `${combat.round}-${combat.turnIndex}-${current.id}`;
    if (this.lastAutoTurnKey === key) {
      return;
    }
    this.lastAutoTurnKey = key;
    setTimeout(() => this.combatService.processCurrentTurnIfNeeded(), 0);
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

type CombatantView = {
  id: string;
  name: string;
  side: string;
  hp: number;
  maxHp: number;
  ac: number;
  alive: boolean;
  unconscious: boolean;
  deathSaves?: { successes: number; failures: number };
};
