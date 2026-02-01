import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AdventureNode, AdventureOption, PendingRoll, Monster } from '../models/adventure.model';
import { GameStateService } from './game-state.service';
import { CombatEngineService } from './combat-engine.service';
import { CharacterStats } from '../models/character.model';
import { RollBusService, RollResult } from '../core/services/roll-bus.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface AdventureData {
  nodes: AdventureNode[];
  monsters: Monster[];
}

@Injectable({
  providedIn: 'root'
})
export class AdventureEngineService {
  private http = inject(HttpClient);
  private gameState = inject(GameStateService);
  private combatEngine = inject(CombatEngineService);
  private rollBus = inject(RollBusService);

  private nodes = new Map<string, AdventureNode>();
  private monsters = new Map<string, Monster>();
  private startNodeId: string | null = null;
  
  // Signals exposed to UI
  readonly currentDisplayNode = signal<AdventureNode | null>(null);
  readonly isLoading = signal<boolean>(true);
  // readonly pendingRoll is now in GameStateService
  private pendingSkillCheck: PendingSkillCheck | null = null;

  async loadAdventure(url: string) {
    this.isLoading.set(true);
    try {
      // Try loading as new format { nodes: [], monsters: [] }
      // Or fallback to array if legacy (though we are building fresh)
      const data = await firstValueFrom(this.http.get<AdventureData | AdventureNode[]>(url));

      if (Array.isArray(data)) {
         data.forEach(node => this.nodes.set(node.nodeId, node));
         this.startNodeId = data[0]?.nodeId ?? null;
      } else {
         data.nodes.forEach(node => this.nodes.set(node.nodeId, node));
         this.startNodeId = data.nodes[0]?.nodeId ?? null;
         if (data.monsters) {
            data.monsters.forEach(m => this.monsters.set(m.id, m));
         }
      }

      this.updateCurrentNode();
    } catch (err) {
      console.error('Failed to load adventure', err);
      this.gameState.addLog({ type: 'info', message: 'Failed to load adventure file.', timestamp: Date.now() });
    } finally {
      this.isLoading.set(false);
    }
  }

  getMonster(id: string): Monster | undefined {
    return this.monsters.get(id);
  }

  constructor() {
    this.rollBus.results$
      .pipe(takeUntilDestroyed())
      .subscribe(result => this.handleDiceResult(result));
  }

  // Called whenever we want to refresh what the user sees based on state
  updateCurrentNode() {
    const nodeId = this.gameState.currentNodeId();
    const node = this.nodes.get(nodeId);
    
    if (!node) {
      // If node missing, maybe it's because we haven't loaded yet or bad ID
      console.warn(`Node ${nodeId} not found!`);
      this.resetToStartNode();
      return;
    }

    // Handle logic nodes automatically
    if (node.type === 'logic') {
      this.processLogicNode(node);
      return;
    }

    // Handle combat nodes
    if (node.type === 'combat') {
        this.processCombatNode(node);
        // Do NOT set currentDisplayNode yet, or set it but Combat UI takes precedence
        // Actually, if we are in combat, the DM card should show combat.
        // We set currentDisplayNode to allow "Description" if needed, but CombatState in GameStateService usually drives UI
        this.currentDisplayNode.set(node);
        return;
    }

    this.currentDisplayNode.set(node);
  }

  startNewAdventure() {
      this.gameState.reset();
      this.resetToStartNode();
  }

  private resetToStartNode() {
    if (!this.startNodeId) {
      return;
    }

    const startNode = this.nodes.get(this.startNodeId);
    if (!startNode) {
      return;
    }

    this.gameState.setNode(this.startNodeId);
    this.currentDisplayNode.set(startNode);
  }

  private processCombatNode(node: AdventureNode) {
    if (!node.monsterIds || !node.victoryNode || !node.defeatNode) {
        console.error('Invalid combat node', node);
        return;
    }

    const monsters: Monster[] = [];
    for (const id of node.monsterIds) {
        const m = this.monsters.get(id);
        if (m) monsters.push(m);
    }

    this.combatEngine.startCombat(monsters, node.victoryNode, node.defeatNode, () => {
        // Callback when combat ends
        this.updateCurrentNode();
    });
  }

  private processLogicNode(node: AdventureNode) {
    const result = this.evaluateCondition(node.condition || 'true');
    const nextNodeId = result ? node.trueNode : node.falseNode;
    
    if (nextNodeId) {
       this.gameState.setNode(nextNodeId);
       // Recursive call to handle chains of logic nodes
       this.updateCurrentNode();
    } else {
        console.error('Logic node has no destination', node);
    }
  }

  evaluateCondition(condition: string): boolean {
    if (!condition || condition === 'always' || condition === 'true') return true;
    
    const char = this.gameState.character();
    
    // Check for stat comparison e.g., "strength > 15"
    const statMatch = condition.match(/([a-zA-Z]+)\s*(>|<|>=|<=|==)\s*(\d+)/);
    if (statMatch) {
      const statName = statMatch[1].toLowerCase();
      const operator = statMatch[2];
      const value = parseInt(statMatch[3], 10);
      
      // Check if stat exists in character stats
      if (statName in char.stats) {
          const statValue = char.stats[statName as keyof CharacterStats];
          switch (operator) {
            case '>': return statValue > value;
            case '<': return statValue < value;
            case '>=': return statValue >= value;
            case '<=': return statValue <= value;
            case '==': return statValue === value;
            default: return false;
          }
      }
      // Could also check HP etc if needed
    }

    // Check tags: "!elf" or "elf"
    if (condition.startsWith('!')) {
      const tag = condition.substring(1).toLowerCase();
      return !this.gameState.hasTag(tag);
    }
    
    return this.gameState.hasTag(condition.toLowerCase());
  }
  
  getAvailableOptions(): AdventureOption[] {
    const node = this.currentDisplayNode();
    if (!node || !node.options) return [];

    return node.options.filter(opt => {
      if (!opt.visibleIf) return true;
      return this.evaluateCondition(opt.visibleIf);
    });
  }

  handleOption(option: AdventureOption) {
    if (option.actionType === 'navigation') {
      if (option.targetNodeId) {
        this.gameState.setNode(option.targetNodeId);
        this.updateCurrentNode();
      }
    } else if (option.actionType === 'skill_check') {
       this.handleSkillCheck(option);
    }
  }

  private handleSkillCheck(option: AdventureOption) {
    const char = this.gameState.character();
    
    let modifier = 0;
    if (option.skill) {
        const skill = option.skill.toLowerCase();
        if (skill in char.stats) {
             const statVal = char.stats[skill as keyof CharacterStats];
             modifier = Math.floor((statVal - 10) / 2);
        }
    }
    
    const requestId = this.createRollId();
    this.pendingSkillCheck = {
      id: requestId,
      reason: `${option.skill} Check`,
      modifier,
      dc: option.dc,
      sourceOption: option
    };

    this.gameState.addLog({
      type: 'info',
      message: `Make a ${option.skill} check (DC ${option.dc}).`,
      timestamp: Date.now()
    });

    this.rollBus.requestRoll({
      id: requestId,
      kind: 'generic',
      label: `${option.skill} Check`,
      expression: '1d20',
      modifier,
      context: {
        source: 'adventure'
      },
      createdAt: Date.now()
    });
  }

  resolvePendingRoll(roll: number) {
    const pending = this.pendingSkillCheck;
    if (!pending) return;
    this.handleSkillCheckResult({
      id: pending.id,
      total: roll + pending.modifier,
      rolls: [roll],
      modifier: pending.modifier,
      expression: '1d20',
      label: pending.reason,
      natural: roll,
      createdAt: Date.now()
    });
  }

  private handleDiceResult(result: RollResult): void {
    const pending = this.pendingSkillCheck;
    if (!pending || result.id !== pending.id) {
      return;
    }
    this.handleSkillCheckResult(result);
  }

  private handleSkillCheckResult(result: RollResult): void {
    const pending = this.pendingSkillCheck;
    if (!pending) return;

    const rawRoll = result.rolls[0] ?? result.total - pending.modifier;
    const total = result.total;
    const option = pending.sourceOption;

    this.gameState.addLog({
      type: 'roll',
      message: `Rolled ${rawRoll} + ${pending.modifier} = ${total} (DC ${pending.dc})`,
      timestamp: Date.now()
    });

    if (pending.onComplete) {
      pending.onComplete(rawRoll);
      this.pendingSkillCheck = null;
      return;
    }

    if (option) {
      if (pending.dc && total >= pending.dc) {
        this.gameState.addLog({ type: 'info', message: 'Success!', timestamp: Date.now() });
        if (option.successNode) {
          this.gameState.setNode(option.successNode);
          this.updateCurrentNode();
        }
      } else {
        this.gameState.addLog({ type: 'info', message: 'Failure!', timestamp: Date.now() });
        if (option.failNode) {
          this.gameState.setNode(option.failNode);
          this.updateCurrentNode();
        }
      }
    }

    this.pendingSkillCheck = null;
  }

  private createRollId(): string {
    return `roll_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }
}

type PendingSkillCheck = PendingRoll & { id: string };
