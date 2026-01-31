import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdventureNode, Monster } from '../models/adventure-models';
import { CombatState, Combatant, HeroSnapshot, CombatPendingRoll } from '../models/combat-models';
import { MonsterRepository } from './monster-repository';
import { GameSessionService } from './game-session.service';
import { GameStateService } from '../../services/game-state.service';
import { abilityMod, proficiencyBonus, rollDie } from '../dnd/dice';
import { resolveAttack } from '../dnd/combat-rules';
import { DiceTrayBridgeService } from './dice-tray-bridge.service';
import { DiceRollResult } from '../models/dice-roll';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class CombatService {
  private monsterRepository = inject(MonsterRepository);
  private gameSession = inject(GameSessionService);
  private gameState = inject(GameStateService);
  private diceTray = inject(DiceTrayBridgeService);
  private rng: () => number = Math.random;
  private stateSignal = signal<CombatState | null>(null);
  private isProcessingTurn = false;

  readonly state = this.stateSignal.asReadonly();

  setRng(rng?: () => number): void {
    this.rng = rng ?? Math.random;
  }

  constructor() {
    this.diceTray.rollResults$
      .pipe(takeUntilDestroyed())
      .subscribe(result => this.handleDiceTrayResult(result));
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
    const monsterOrder = monsterCombatants.map((combatant) => {
      const initiative = rollDie(20, this.rng) + abilityMod(combatant.abilities.dex);
      return { ...combatant, initiative };
    });

    const order = [hero, ...monsterOrder];

    const nodeRecord = node as Record<string, unknown>;
    const victoryNodeId = this.getString(nodeRecord, 'victoryNode') ?? this.getString(nodeRecord, 'victoryNodeId');
    const defeatNodeId = this.getString(nodeRecord, 'defeatNode') ?? this.getString(nodeRecord, 'defeatNodeId');

    const dexMod = abilityMod(hero.abilities.dex);
    const pendingRoll = this.createPendingRoll({
      kind: 'hero_initiative',
      actorId: hero.id,
      label: 'Initiative',
      expression: '1d20',
      modifier: dexMod
    });

    const state: CombatState = {
      active: true,
      adventureId,
      nodeId: node.nodeId,
      round: 1,
      turnIndex: 0,
      order,
      log: [],
      pendingRoll,
      awaitingPlayer: true,
      autoStepDelayMs: 800,
      victoryNodeId,
      defeatNodeId
    };

    this.stateSignal.set(state);
    this.addLog('Combat begins.');
    this.requestRoll(pendingRoll, {
      combatId: node.nodeId,
      actorId: hero.id,
      kind: 'initiative'
    });
  }

  heroAttack(targetId: string): void {
    const state = this.stateSignal();
    if (!state?.active) return;

    const current = state.order[state.turnIndex];
    if (!current || current.id !== 'hero' || current.unconscious || !current.alive) {
      return;
    }

    if (state.awaitingPlayer) {
      return;
    }

    const targetIndex = state.order.findIndex((combatant) => combatant.id === targetId);
    if (targetIndex === -1) return;

    const target = state.order[targetIndex];
    if (!target.alive) return;

    const attack = current.attack ?? { bonus: 0, damageDice: '1d4', damageBonus: 0, label: 'Strike' };
    const pendingRoll = this.createPendingRoll({
      kind: 'hero_attack',
      actorId: current.id,
      targetId: target.id,
      label: 'Attack Roll',
      expression: '1d20',
      modifier: attack.bonus
    });

    this.stateSignal.set({ ...state, pendingRoll, awaitingPlayer: true });
    this.addLog(`${current.name} targets ${target.name}.`);
    this.requestRoll(pendingRoll, {
      combatId: state.nodeId,
      actorId: current.id,
      targetId: target.id,
      kind: 'hero_attack'
    });
  }

  endTurn(): void {
    const state = this.stateSignal();
    if (!state?.active) return;
    if (state.awaitingPlayer) return;
    this.advanceTurn();
  }

  async monsterAutoTurn(): Promise<void> {
    const state = this.stateSignal();
    if (!state?.active) return;
    if (this.isProcessingTurn || state.awaitingPlayer) return;
    const current = state.order[state.turnIndex];
    if (!current || current.side !== 'monster' || !current.alive) {
      return;
    }

    this.isProcessingTurn = true;
    try {
    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;
    const hero = state.order[heroIndex];
    if (!hero.alive) {
      this.endCombat('defeat');
      return;
    }

    const attack = current.attack ?? { bonus: 0, damageDice: '1d4', damageBonus: 0, label: 'Attack' };
    this.addLog(`${current.name} attacks!`);
    await this.sleep(state.autoStepDelayMs);

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
      await this.sleep(state.autoStepDelayMs);
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
    await this.sleep(state.autoStepDelayMs);
    this.advanceTurn();
    } finally {
      this.isProcessingTurn = false;
    }
  }

  endCombat(outcome: 'victory' | 'defeat'): void {
    const state = this.stateSignal();
    if (!state) return;

    const nextState = { ...state, active: false, pendingRoll: undefined, awaitingPlayer: false };
    this.stateSignal.set(nextState);
    const targetNodeId = outcome === 'victory' ? state.victoryNodeId : state.defeatNodeId;
    if (targetNodeId) {
      this.gameSession.goToNode(targetNodeId);
    }
  }

  clearCombat(): void {
    this.stateSignal.set(null);
    this.isProcessingTurn = false;
  }

  processCurrentTurnIfNeeded(): void {
    const state = this.stateSignal();
    if (!state?.active) return;
    const current = state.order[state.turnIndex];
    if (!current || current.side !== 'monster' || !current.alive) {
      return;
    }
    void this.monsterAutoTurn();
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
      this.requestHeroDeathSave(state);
    }
  }

  private requestHeroDeathSave(state: CombatState): void {
    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;

    const hero = state.order[heroIndex];
    const pendingRoll = this.createPendingRoll({
      kind: 'death_save',
      actorId: hero.id,
      label: 'Death Save',
      expression: '1d20',
      modifier: 0
    });

    this.stateSignal.set({ ...state, pendingRoll, awaitingPlayer: true });
    this.addLog('Make a death saving throw.');
    this.requestRoll(pendingRoll, {
      combatId: state.nodeId,
      actorId: hero.id,
      kind: 'death_save'
    });
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

    const nextState = { ...state, turnIndex, round, awaitingPlayer: false, pendingRoll: undefined };
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

  private handleDiceTrayResult(result: DiceRollResult): void {
    const state = this.stateSignal();
    if (!state?.active || !state.pendingRoll) return;
    if (result.id !== state.pendingRoll.id) return;

    switch (state.pendingRoll.kind) {
      case 'hero_initiative':
        this.handleHeroInitiativeResult(state, result);
        break;
      case 'hero_attack':
        this.handleHeroAttackResult(state, result);
        break;
      case 'hero_damage':
        this.handleHeroDamageResult(state, result);
        break;
      case 'death_save':
        this.handleDeathSaveResult(state, result);
        break;
      default:
        break;
    }
  }

  private handleHeroInitiativeResult(state: CombatState, result: DiceRollResult): void {
    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;
    const hero = state.order[heroIndex];
    const updatedHero = { ...hero, initiative: result.total };
    const updatedOrder = [...state.order];
    updatedOrder[heroIndex] = updatedHero;

    const sortedOrder = this.sortInitiative(updatedOrder);
    const nextState: CombatState = {
      ...state,
      order: sortedOrder,
      turnIndex: 0,
      awaitingPlayer: false,
      pendingRoll: undefined
    };
    this.stateSignal.set(nextState);
    this.addLog(`Hero initiative is ${result.total}.`);
    this.beginTurn(nextState);
  }

  private handleHeroAttackResult(state: CombatState, result: DiceRollResult): void {
    const hero = state.order.find((combatant) => combatant.id === 'hero');
    const pending = state.pendingRoll;
    if (!hero || !pending || !pending.targetId) return;

    const targetIndex = state.order.findIndex((combatant) => combatant.id === pending.targetId);
    if (targetIndex === -1) return;
    const target = state.order[targetIndex];
    if (!target.alive) {
      this.clearPendingAndResume(state);
      return;
    }

    const natural = result.natural ?? result.rolls[0];
    const total = result.total;
    let logText = `${hero.name} attacks ${target.name}. Roll ${total} vs AC ${target.ac}.`;

    if (natural === 1) {
      logText += ' Miss.';
      this.stateSignal.set({ ...state, log: this.appendLog(state.log, logText), awaitingPlayer: false, pendingRoll: undefined });
      void this.bufferAdvanceTurn();
      return;
    }

    const isCritical = natural === 20;
    const hit = isCritical || total >= target.ac;
    if (!hit) {
      logText += ' Miss.';
      this.stateSignal.set({ ...state, log: this.appendLog(state.log, logText), awaitingPlayer: false, pendingRoll: undefined });
      void this.bufferAdvanceTurn();
      return;
    }

    logText += isCritical ? ' Critical hit.' : ' Hit.';
    const attack = hero.attack ?? { bonus: 0, damageDice: '1d4', damageBonus: 0, label: 'Strike' };
    const damageExpression = isCritical ? this.doubleDiceCount(attack.damageDice) : attack.damageDice;
    const pendingRoll = this.createPendingRoll({
      kind: 'hero_damage',
      actorId: hero.id,
      targetId: target.id,
      label: 'Damage Roll',
      expression: damageExpression,
      modifier: attack.damageBonus,
      critical: isCritical
    });

    const nextState = { ...state, log: this.appendLog(state.log, logText), pendingRoll, awaitingPlayer: true };
    this.stateSignal.set(nextState);
    this.requestRoll(pendingRoll, {
      combatId: state.nodeId,
      actorId: hero.id,
      targetId: target.id,
      kind: 'hero_damage'
    });
  }

  private handleHeroDamageResult(state: CombatState, result: DiceRollResult): void {
    const pending = state.pendingRoll;
    if (!pending?.targetId) return;
    const targetIndex = state.order.findIndex((combatant) => combatant.id === pending.targetId);
    if (targetIndex === -1) return;
    const target = state.order[targetIndex];
    if (!target.alive) {
      this.clearPendingAndResume(state);
      return;
    }

    const damage = result.total;
    const updatedTarget = { ...target };
    updatedTarget.hp = Math.max(0, updatedTarget.hp - damage);
    if (updatedTarget.hp === 0) {
      updatedTarget.alive = false;
    }
    const updatedOrder = [...state.order];
    updatedOrder[targetIndex] = updatedTarget;

    let logText = `Damage roll ${damage}.`;
    if (pending.critical) {
      logText += ' Critical damage.';
    }
    if (!updatedTarget.alive) {
      logText += ` ${target.name} falls.`;
    }

    const nextState = {
      ...state,
      order: updatedOrder,
      log: this.appendLog(state.log, logText),
      awaitingPlayer: false,
      pendingRoll: undefined
    };
    this.stateSignal.set(nextState);

    if (this.allMonstersDefeated(updatedOrder)) {
      this.endCombat('victory');
      return;
    }

    void this.bufferAdvanceTurn();
  }

  private handleDeathSaveResult(state: CombatState, result: DiceRollResult): void {
    const heroIndex = state.order.findIndex((combatant) => combatant.id === 'hero');
    if (heroIndex === -1) return;
    const hero = state.order[heroIndex];
    const deathSaves = hero.deathSaves ?? { successes: 0, failures: 0 };
    const natural = result.natural ?? result.rolls[0] ?? result.total;

    let successes = deathSaves.successes;
    let failures = deathSaves.failures;
    let logText = `Death save roll ${result.total}.`;
    let revived = false;

    if (natural === 1) {
      failures += 2;
      logText += ' Critical failure.';
    } else if (natural === 20) {
      revived = true;
      logText += ' Natural 20. Hero returns with 1 HP.';
    } else if (result.total >= 10) {
      successes += 1;
      logText += ' Success.';
    } else {
      failures += 1;
      logText += ' Failure.';
    }

    const updatedHero = { ...hero };
    if (revived) {
      updatedHero.hp = 1;
      updatedHero.unconscious = false;
      updatedHero.deathSaves = { successes: 0, failures: 0 };
      this.gameState.updateHp(1);
    } else {
      updatedHero.deathSaves = { successes, failures };
    }

    if (failures >= 3) {
      updatedHero.alive = false;
      logText += ' Hero dies.';
    } else if (successes >= 3) {
      logText += ' Hero is stable.';
    }

    const updatedOrder = [...state.order];
    updatedOrder[heroIndex] = updatedHero;

    const nextState = {
      ...state,
      order: updatedOrder,
      log: this.appendLog(state.log, logText),
      awaitingPlayer: false,
      pendingRoll: undefined
    };
    this.stateSignal.set(nextState);

    if (updatedHero.alive === false) {
      this.endCombat('defeat');
      return;
    }

    if (!updatedHero.unconscious) {
      return;
    }

    void this.bufferAdvanceTurn();
  }

  private createPendingRoll(data: Omit<CombatPendingRoll, 'id' | 'createdAt'>): CombatPendingRoll {
    return {
      ...data,
      id: this.createRollId(),
      createdAt: Date.now()
    };
  }

  private requestRoll(pending: CombatPendingRoll, context: DiceRollRequestContext): void {
    this.diceTray.requestRoll({
      id: pending.id,
      label: pending.label,
      expression: pending.expression,
      modifier: pending.modifier,
      context: {
        ...context,
        kind: pending.kind
      }
    });
  }

  private clearPendingAndResume(state: CombatState): void {
    this.stateSignal.set({ ...state, awaitingPlayer: false, pendingRoll: undefined });
  }

  private sortInitiative(order: Combatant[]): Combatant[] {
    return [...order].sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      const dexDiff = abilityMod(b.abilities.dex) - abilityMod(a.abilities.dex);
      if (dexDiff !== 0) {
        return dexDiff;
      }
      return this.rng() < 0.5 ? -1 : 1;
    });
  }

  private doubleDiceCount(expression: string): string {
    const trimmed = expression.replace(/\s+/g, '').toLowerCase();
    const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(trimmed);
    if (!match) {
      return expression;
    }
    const count = Number.parseInt(match[1], 10) * 2;
    const sides = match[2];
    const modifier = match[3] ?? '';
    return `${count}d${sides}${modifier}`;
  }

  private createRollId(): string {
    return `roll_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  private async bufferAdvanceTurn(): Promise<void> {
    const state = this.stateSignal();
    if (!state?.active) return;
    await this.sleep(state.autoStepDelayMs);
    this.advanceTurn();
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

type DiceRollRequestContext = {
  combatId?: string;
  actorId?: string;
  targetId?: string;
  kind?: string;
};
