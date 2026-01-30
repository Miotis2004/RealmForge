import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AdventureNode, AdventureOption } from '../models/adventure.model';
import { GameStateService } from './game-state.service';
import { CharacterStats } from '../models/character.model';

@Injectable({
  providedIn: 'root'
})
export class AdventureEngineService {
  private http = inject(HttpClient);
  private gameState = inject(GameStateService);

  private nodes = new Map<string, AdventureNode>();
  
  // Signals exposed to UI
  readonly currentDisplayNode = signal<AdventureNode | null>(null);
  readonly isLoading = signal<boolean>(true);

  async loadAdventure(url: string) {
    this.isLoading.set(true);
    try {
      const nodes = await firstValueFrom(this.http.get<AdventureNode[]>(url));
      nodes.forEach(node => this.nodes.set(node.nodeId, node));
      this.updateCurrentNode();
    } catch (err) {
      console.error('Failed to load adventure', err);
      // Fallback for verification if file is missing (development only)
      this.gameState.addLog({ type: 'info', message: 'Failed to load adventure file.', timestamp: Date.now() });
    } finally {
      this.isLoading.set(false);
    }
  }

  // Called whenever we want to refresh what the user sees based on state
  updateCurrentNode() {
    const nodeId = this.gameState.currentNodeId();
    const node = this.nodes.get(nodeId);
    
    if (!node) {
      // If node missing, maybe it's because we haven't loaded yet or bad ID
      console.warn(`Node ${nodeId} not found!`);
      return;
    }

    // Handle logic nodes automatically
    if (node.type === 'logic') {
      this.processLogicNode(node);
      return;
    }

    this.currentDisplayNode.set(node);
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
    // Basic roll simulation
    const roll = Math.floor(Math.random() * 20) + 1;
    const char = this.gameState.character();
    
    let modifier = 0;
    if (option.skill) {
        const skill = option.skill.toLowerCase();
        if (skill in char.stats) {
             const statVal = char.stats[skill as keyof CharacterStats];
             modifier = Math.floor((statVal - 10) / 2);
        }
    }
    
    const total = roll + modifier; 
    
    this.gameState.addLog({
      type: 'roll',
      message: `Skill Check (${option.skill}): Rolled ${roll} + ${modifier} = ${total} (DC ${option.dc})`,
      timestamp: Date.now()
    });

    if (option.dc && total >= option.dc) {
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
}
