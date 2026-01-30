import { Character } from './character.model';
import { Monster, MonsterAction } from './adventure.model';

export interface LogEntry {
  type: 'narrative' | 'combat' | 'roll' | 'info';
  message: string;
  timestamp: number;
}

export interface Combatant {
  instanceId: string;
  name: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  monsterId?: string; // Reference to the static monster data
  behavior?: MonsterAction[];
}

export interface CombatState {
  isActive: boolean;
  round: number;
  turnOrder: Combatant[]; // Sorted by initiative
  currentTurnIndex: number;
  victoryNode?: string;
  defeatNode?: string;
}

export interface GameState {
  character: Character;
  currentNodeId: string;
  gameLog: LogEntry[];
  tags: string[]; 
  combat?: CombatState;
}
