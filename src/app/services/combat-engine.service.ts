import { Injectable, inject } from '@angular/core';
import { GameStateService } from './game-state.service';
import { Combatant, CombatState } from '../models/game-state.model';
import { Monster } from '../models/adventure.model';

@Injectable({
  providedIn: 'root'
})
export class CombatEngineService {
  private gameState = inject(GameStateService);

  private onCombatEndCallback?: () => void;

  async startCombat(monstersDef: Monster[], victoryNode: string, defeatNode: string, onCombatEnd: () => void) {
    const monsters: Combatant[] = [];
    this.onCombatEndCallback = onCombatEnd;

    // Create monster combatants
    for (let i = 0; i < monstersDef.length; i++) {
        const def = monstersDef[i];
        monsters.push({
            instanceId: `monster_${i}_${def.id}`,
            name: def.name,
            isPlayer: false,
            hp: def.stats.hp,
            maxHp: def.stats.hp,
            ac: def.stats.ac,
            initiative: Math.floor(Math.random() * 20) + 1, // Simple init
            monsterId: def.id,
            behavior: def.behavior
        });
    }

    if (monsters.length === 0) {
        console.error('No monsters found for combat');
        this.gameState.setNode(victoryNode);
        if (this.onCombatEndCallback) this.onCombatEndCallback();
        return;
    }

    // Add Player
    const playerChar = this.gameState.character();
    const player: Combatant = {
        instanceId: 'player',
        name: playerChar.name,
        isPlayer: true,
        hp: playerChar.hp,
        maxHp: playerChar.maxHp,
        ac: playerChar.ac,
        initiative: Math.floor(Math.random() * 20) + 1 + Math.floor((playerChar.stats.dexterity - 10)/2)
    };

    const turnOrder = [player, ...monsters].sort((a, b) => b.initiative - a.initiative);

    this.gameState.combatState.set({
        isActive: true,
        round: 1,
        turnOrder,
        currentTurnIndex: 0,
        victoryNode,
        defeatNode
    });

    this.gameState.addLog({ type: 'combat', message: 'Combat Started!', timestamp: Date.now() });

    this.processTurn();
  }

  private async processTurn() {
    const state = this.gameState.combatState();
    if (!state || !state.isActive) return;

    // Check Victory/Defeat
    const player = state.turnOrder.find(c => c.isPlayer);
    const monsters = state.turnOrder.filter(c => !c.isPlayer);

    if (!player || player.hp <= 0) {
        this.endCombat(false);
        return;
    }

    if (monsters.every(m => m.hp <= 0)) {
        this.endCombat(true);
        return;
    }

    const current = state.turnOrder[state.currentTurnIndex];

    if (current.hp <= 0) {
        this.nextTurn();
        return;
    }

    this.gameState.addLog({
        type: 'info',
        message: `Turn: ${current.name} (HP: ${current.hp})`,
        timestamp: Date.now()
    });

    if (current.isPlayer) {
        // Wait for UI input
    } else {
        // Monster AI Delay
        await new Promise(r => setTimeout(r, 1000));
        this.processMonsterTurn(current);
    }
  }

  private processMonsterTurn(monster: Combatant) {
     if (!monster.behavior) {
         this.nextTurn();
         return;
     }

     let actionTaken = false;

     const behaviors = [...monster.behavior].sort((a,b) => a.priority - b.priority);

     for (const b of behaviors) {
         if (this.evaluateCondition(b.condition, monster)) {
             this.executeMonsterAction(b.action, monster);
             actionTaken = true;
             break;
         }
     }

     if (!actionTaken) {
         this.gameState.addLog({ type: 'combat', message: `${monster.name} hesitates.`, timestamp: Date.now() });
     }

     this.nextTurn();
  }

  private evaluateCondition(condition: string, actor: Combatant): boolean {
      if (condition === 'always') return true;

      // "self_hp < 4"
      if (condition.includes('self_hp')) {
          const match = condition.match(/self_hp\s*(<|>|<=|>=)\s*(\d+)/);
          if (match) {
              const op = match[1];
              const val = parseInt(match[2]);
              switch (op) {
                  case '<': return actor.hp < val;
                  case '>': return actor.hp > val;
                  case '<=': return actor.hp <= val;
                  case '>=': return actor.hp >= val;
              }
          }
      }

      // "player_distance > 5ft" - ignore for now, return true or false (assume adjacent)
      if (condition.includes('player_distance')) return false; // Force close combat behaviors

      return true;
  }

  private executeMonsterAction(action: string, actor: Combatant) {
      // "shortbow_attack", "dagger_attack", "disengage_and_hide"

      const state = this.gameState.combatState();
      const player = state?.turnOrder.find(c => c.isPlayer);
      if (!player) return;

      if (action.includes('attack')) {
          // Simple roll
          const roll = Math.floor(Math.random() * 20) + 1;
          const hitMod = 4; // Hardcoded for prototype
          const dmg = Math.floor(Math.random() * 6) + 2;

          const total = roll + hitMod;
          const hit = total >= player.ac;

          this.gameState.addLog({
              type: 'combat',
              message: `${actor.name} attacks! Rolled ${total} vs AC ${player.ac}.`,
              timestamp: Date.now()
          });

          if (hit) {
              this.gameState.addLog({ type: 'combat', message: `Hit! Dealing ${dmg} damage.`, timestamp: Date.now() });
              this.gameState.updateHp(-dmg);
              // Update combatant record too
              player.hp -= dmg;
          } else {
              this.gameState.addLog({ type: 'combat', message: `Miss!`, timestamp: Date.now() });
          }
      } else if (action === 'disengage_and_hide') {
          this.gameState.addLog({ type: 'combat', message: `${actor.name} disengages and tries to hide.`, timestamp: Date.now() });
      }
  }

  nextTurn() {
      const state = this.gameState.combatState();
      if (!state) return;

      let nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
      let round = state.round;
      if (nextIndex === 0) round++;

      this.gameState.combatState.set({
          ...state,
          currentTurnIndex: nextIndex,
          round
      });

      this.processTurn();
  }

  playerAction(action: 'attack', targetId?: string) {
      // Assume attacking first living monster
      const state = this.gameState.combatState();
      if (!state) return;

      const targets = state.turnOrder.filter(c => !c.isPlayer && c.hp > 0);
      if (targets.length === 0) return; // Combat should be over

      const target = targets[0]; // Attack first available

      const hitMod = 5; // Hardcoded player stat for prototype

      this.gameState.addLog({
          type: 'info',
          message: `You prepare to attack ${target.name}.`,
          timestamp: Date.now()
      });

      this.gameState.pendingRoll.set({
          reason: `Attack ${target.name}`,
          modifier: hitMod,
          onComplete: (roll) => {
              const total = roll + hitMod;
              const dmg = Math.floor(Math.random() * 8) + 3; // Longsword

              this.gameState.addLog({
                  type: 'combat',
                  message: `Rolled ${total} vs AC ${target.ac}`,
                  timestamp: Date.now()
              });

              if (total >= target.ac) {
                  this.gameState.addLog({ type: 'combat', message: `Hit! ${dmg} damage.`, timestamp: Date.now() });
                  target.hp -= dmg;
              } else {
                  this.gameState.addLog({ type: 'combat', message: `Miss!`, timestamp: Date.now() });
              }

              this.nextTurn();
          }
      });
  }

  private endCombat(victory: boolean) {
      const state = this.gameState.combatState();
      if (!state) return;

      this.gameState.combatState.set({ ...state, isActive: false });

      if (victory) {
          this.gameState.addLog({ type: 'info', message: 'Victory!', timestamp: Date.now() });
          if (state.victoryNode) {
              this.gameState.setNode(state.victoryNode);
          }
      } else {
          this.gameState.addLog({ type: 'info', message: 'Defeat...', timestamp: Date.now() });
           if (state.defeatNode) {
              this.gameState.setNode(state.defeatNode);
          }
      }

      // Clear combat state fully
      this.gameState.combatState.set(null);

      if (this.onCombatEndCallback) this.onCombatEndCallback();
  }
}
