import { Character } from './character.model';

export interface LogEntry {
  type: 'narrative' | 'combat' | 'roll' | 'info';
  message: string;
  timestamp: number;
}

export interface GameState {
  character: Character;
  currentNodeId: string;
  gameLog: LogEntry[];
  tags: string[]; 
}
