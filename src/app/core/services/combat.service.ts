import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdventureNode, Monster } from '../models/adventure-models';
import { CombatState, Combatant, HeroSnapshot } from '../models/combat-models';
import { MonsterRepository } from './monster-repository';
import { GameSessionService } from './game-session.service';
import { GameStateService } from '../../services/game-state.service';
import { abilityMod, proficiencyBonus, rollDie } from '../dnd/dice';
import { resolveAttack, resolveDeathSave } from '../dnd/combat-rules';

@Injectable({
  providedIn: 'root'
})
export class CombatService {
  private monsterRepository = inject(MonsterRepository);
  private gameSession = inject(GameSessionService);
  private gameState = inject(GameStateService);
  private rng: () => number = Math.random;
  private stateSignal = signal<CombatState | null>(null);

  readonly state = this.stateSignal.asReadonly();

  setRng(rng?: () => number): void {
    this.rng = rng ?? Math.random;
  }

  async startCombat(adventureId: string, node: AdventureNode, heroSnapshot: HeroSnapshot): Promise<void> {
    const monsterIds = Array.isArray(node.monsterIds) ? node.monsterIds : [];
    if (!monsterIds.length && node.type !== 'combat') {
      return;
    }

    const existing = this.stateSignal();
    if (existing?.active && existing.nodeId === node.nodeId) {
      return;
    }

    const monsters = await firstValueFrom(this.monsterRepository.getMonsters$(monsterIds));
    const hero = this.buildHeroCombatant(heroSnapshot);
    const monsterCombatants = monsters.map((monster, index) => this.buildMonsterCombatant(monster, index));
    const order = [hero, ...monsterCombatants].map((combatant) => {
      const initiative = rollDie(20, this.rng) + abilityMod(combatant.abilities.dex);
      return { ...combatant, initiative };
    });

    order.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      const dexDiff = abilityMod(b.abilities.dex) - abilityMod(a.abilities.dex);
      if (dexDiff !== 0) {
        return dexDiff;
      }
      return this.rng() < 0.5 ? -1 : 1;
    });

    const nodeRecord = node as Record<string, unknown>;
    const victoryNodeId = this.getString(nodeRecord, 'victoryNode') ?? this.getString(nodeRecord, 'victoryNodeId');
    const defeatNodeId = this.getString(nodeRecord, 'defeatNode') ?? this.getString(nodeRecord, 'defeatNodeId');

    const state: CombatState = {
      active: true,
      adventureId,
      nodeId: node.nodeId,
      round: 1,
      turnIndex: 0,
      order,
      log: [],
      victoryNodeId,
      defeatNodeId
    };

    this.stateSignal.set(state);
    this.addLog('Combat begins.');
    this.beginTurn(state);
  }

  heroAttack(targetId: string): void {
    const state = this.stateSignal();
    if (!state?.active) return;

    const current = state.order[state.turnIndex];
    if (!current || current.id !== 'hero' || current.unconscious || !current.alive) {
      return;
    }

    const targetIndex = state.order.findIndex((combatant) => combatant.id === targetId);
    if (targetIndex === -1) return;

    const target = state.order[targetIndex];
    if (!target.alive) return;

    const attack = current.attack ?? { bonus: 0, damageDice: '1d4', damageBonus: 0, label: 'Strike' };
    const resolution = resolveAttack({
      attackerAttackBonus: attack.bonus,
      targetAc: target.ac,
      damageDice: attack.damageDice,
      damageBonus: attack.damageBonus,
      rng: this.rng
    });

    const updatedOrder = [...state.order];
    let logText = `${current.name} attacks ${target.name}.`;
    logText += ` Roll ${resolution.attackRoll.total} vs AC ${resolution.targetAc}.`;
    if (!resolution.hit) {
      logText += ' Miss.';
      this.stateSignal.set({ ...state, order: updatedOrder, log: this.appendLog(state.log, logText) });
      this.advanceTurn();
      return;
    }

    const damage = resolution.damageRoll?.total ?? 0;
    const updatedTarget = { ...target };
    updatedTarget.hp = Math.max(0, updatedTarget.hp - damage);
    if (updatedTarget.hp === 0) {
      updatedTarget.alive = false;
    }
    updatedOrder[targetIndex] = updatedTarget;

    logText += ` Hit for ${damage} damage.`;
    if (!updatedTarget.alive) {
      logText += ` ${target.name} falls.`;
    }

    this.stateSignal.set({ ...state, order: updatedOrder, log: this.appendLog(state.log, logText) });
    if (this.allMonstersDefeated(updatedOrder)) {
      this.endCombat('victory');
      return;
    }

    this.advanceTurn();
  }

  endTurn(): void {
    const state = this.stateSignal();
    if (!state?.active) return;
    this.advanceTurn();
  }

  monsterAutoTurn(): void {
    const state = this.stateSignal();
    if (!state?.active) return;
    const current = state.order[state.turnIndex];
    if (!current || current.side !== 'monster' || !current.alive) {
      return;
    }

    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;
    const hero = state.order[heroIndex];
    if (!hero.alive) {
      this.endCombat('defeat');
      return;
    }

    const attack = current.attack ?? { bonus: 0, damageDice: '1d4', damageBonus: 0, label: 'Attack' };
    const resolution = resolveAttack({
      attackerAttackBonus: attack.bonus,
      targetAc: hero.ac,
      damageDice: attack.damageDice,
      damageBonus: attack.damageBonus,
      rng: this.rng
    });

    const updatedOrder = [...state.order];
    let logText = `${current.name} attacks ${hero.name}.`;
    logText += ` Roll ${resolution.attackRoll.total} vs AC ${resolution.targetAc}.`;

    if (!resolution.hit) {
      logText += ' Miss.';
      this.stateSignal.set({ ...state, order: updatedOrder, log: this.appendLog(state.log, logText) });
      this.advanceTurn();
      return;
    }

    const damage = resolution.damageRoll?.total ?? 0;
    const updatedHero = { ...hero };
    updatedHero.hp = Math.max(0, updatedHero.hp - damage);
    if (updatedHero.hp === 0) {
      updatedHero.unconscious = true;
      updatedHero.deathSaves = updatedHero.deathSaves ?? { successes: 0, failures: 0 };
    }
    updatedOrder[heroIndex] = updatedHero;

    this.gameState.updateHp(-damage);
    logText += ` Hit for ${damage} damage.`;
    if (updatedHero.unconscious) {
      logText += ' Hero is unconscious.';
    }

    this.stateSignal.set({ ...state, order: updatedOrder, log: this.appendLog(state.log, logText) });
    this.advanceTurn();
  }

  endCombat(outcome: 'victory' | 'defeat'): void {
    const state = this.stateSignal();
    if (!state) return;

    const nextState = { ...state, active: false };
    this.stateSignal.set(nextState);
    const targetNodeId = outcome === 'victory' ? state.victoryNodeId : state.defeatNodeId;
    if (targetNodeId) {
      this.gameSession.goToNode(targetNodeId);
    }
  }

  clearCombat(): void {
    this.stateSignal.set(null);
  }

  private beginTurn(state: CombatState): void {
    const current = state.order[state.turnIndex];
    if (!current) return;

    if (!current.alive) {
      this.advanceTurn();
      return;
    }

    if (current.side === 'hero' && current.unconscious) {
      if (current.deathSaves && current.deathSaves.successes >= 3) {
        this.stateSignal.set({
          ...state,
          log: this.appendLog(state.log, 'Hero is stable but unconscious.')
        });
        this.advanceTurn();
        return;
      }
      this.resolveHeroDeathSave(state);
    }
  }

  private resolveHeroDeathSave(state: CombatState): void {
    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;

    const hero = state.order[heroIndex];
    const deathSaves = hero.deathSaves ?? { successes: 0, failures: 0 };
    const result = resolveDeathSave(deathSaves, this.rng);

    const updatedHero = { ...hero, deathSaves: { successes: result.successes, failures: result.failures } };
    let logText = `Death save roll ${result.roll.total}.`;

    if (result.revived) {
      updatedHero.hp = 1;
      updatedHero.unconscious = false;
      updatedHero.deathSaves = { successes: 0, failures: 0 };
      logText += ' Natural 20. Hero returns with 1 HP.';
      this.gameState.updateHp(1);
    } else if (result.dead) {
      updatedHero.alive = false;
      logText += ' Hero dies.';
    } else if (result.stabilized) {
      logText += ' Hero is stable.';
    } else if (result.roll.rolls[0] === 1) {
      logText += ' Critical failure.';
    } else if (result.roll.total >= 10) {
      logText += ' Success.';
    } else {
      logText += ' Failure.';
    }

    const updatedOrder = [...state.order];
    updatedOrder[heroIndex] = updatedHero;
    this.stateSignal.set({ ...state, order: updatedOrder, log: this.appendLog(state.log, logText) });

    if (updatedHero.alive === false) {
      this.endCombat('defeat');
      return;
    }

    if (!updatedHero.unconscious) {
      return;
    }

    this.advanceTurn();
  }

  private advanceTurn(): void {
    const state = this.stateSignal();
    if (!state?.active) return;

    const order = state.order;
    let turnIndex = state.turnIndex;
    let round = state.round;
    let attempts = 0;

    do {
      turnIndex += 1;
      if (turnIndex >= order.length) {
        turnIndex = 0;
        round += 1;
      }
      attempts += 1;
    } while (attempts <= order.length && !order[turnIndex]?.alive);

    const nextState = { ...state, turnIndex, round };
    this.stateSignal.set(nextState);
    this.beginTurn(nextState);
  }

  private addLog(text: string): void {
    const state = this.stateSignal();
    if (!state) return;
    this.stateSignal.set({ ...state, log: this.appendLog(state.log, text) });
  }

  private appendLog(log: CombatState['log'], text: string): CombatState['log'] {
    return [...log, { ts: Date.now(), text }];
  }

  private allMonstersDefeated(order: Combatant[]): boolean {
    return order.filter((combatant) => combatant.side === 'monster').every((combatant) => !combatant.alive);
  }

  private buildHeroCombatant(hero: HeroSnapshot): Combatant {
    const strengthMod = abilityMod(hero.abilities.str);
    const attackBonus = strengthMod + proficiencyBonus(hero.level);

    return {
      id: 'hero',
      name: hero.name || 'Hero',
      side: 'hero',
      ac: hero.ac,
      maxHp: hero.maxHp,
      hp: hero.hp,
      abilities: hero.abilities,
      initiative: 0,
      alive: hero.hp > 0,
      unconscious: hero.hp <= 0,
      deathSaves: hero.hp <= 0 ? { successes: 0, failures: 0 } : undefined,
      attack: {
        bonus: attackBonus,
        damageDice: '1d8',
        damageBonus: strengthMod,
        label: 'Longsword'
      }
    };
  }

  private buildMonsterCombatant(monster: Monster, index: number): Combatant {
    const stats = monster.stats ?? {};
    const dex = this.getNumber(stats, 'dex') ?? 10;
    const ac = this.getNumber(stats, 'ac') ?? 10;
    const hp = this.getNumber(stats, 'hp') ?? 5;
    const speed = this.getNumber(stats, 'speed');

    const attackRecord = this.isRecord(monster['attack']) ? (monster['attack'] as Record<string, unknown>) : undefined;
    const attackBonus =
      this.getNumber(attackRecord, 'bonus') ??
      this.getNumber(stats, 'attackBonus') ??
      this.getNumber(monster, 'attackBonus') ??
      2;
    const damageDice =
      this.getString(attackRecord, 'damageDice') ??
      this.getString(stats, 'damageDice') ??
      this.getString(monster, 'damageDice') ??
      '1d6';
    const damageBonus =
      this.getNumber(attackRecord, 'damageBonus') ??
      this.getNumber(stats, 'damageBonus') ??
      this.getNumber(monster, 'damageBonus') ??
      0;
    const label = this.getString(attackRecord, 'label') ?? 'Strike';

    return {
      id: `${monster.id}__${index}`,
      name: monster.name,
      side: 'monster',
      ac,
      maxHp: hp,
      hp,
      speed,
      abilities: {
        str: this.getNumber(stats, 'str') ?? 10,
        dex,
        con: this.getNumber(stats, 'con') ?? 10,
        int: this.getNumber(stats, 'int') ?? 10,
        wis: this.getNumber(stats, 'wis') ?? 10,
        cha: this.getNumber(stats, 'cha') ?? 10
      },
      initiative: 0,
      alive: hp > 0,
      attack: {
        bonus: attackBonus,
        damageDice,
        damageBonus,
        label
      }
    };
  }

  private getNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
    if (!record) return undefined;
    const value = record[key];
    return typeof value === 'number' ? value : undefined;
  }

  private getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
    if (!record) return undefined;
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
