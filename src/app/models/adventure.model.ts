export type NodeType = 'narrative' | 'interaction' | 'logic' | 'combat';
export type ActionType = 'navigation' | 'skill_check' | 'combat_start';

export interface AdventureOption {
  label: string;
  actionType: ActionType;
  
  // For navigation
  targetNodeId?: string; 
  
  // For skill checks
  skill?: string;
  dc?: number;
  successNode?: string;
  failNode?: string;

  // Conditions
  visibleIf?: string; // e.g., "!elf", "has_key"
}

export interface AdventureNode {
  nodeId: string;
  type: NodeType;
  text?: string;
  options?: AdventureOption[];

  // For logic nodes
  condition?: string;
  trueNode?: string;
  falseNode?: string;

  // For combat nodes
  monsterIds?: string[];
  victoryNode?: string;
  defeatNode?: string;
}

export interface MonsterAction {
  priority: number;
  condition: string; // e.g. "self_hp < 4"
  action: string; // "disengage_and_hide"
}

export interface MonsterStats {
  hp: number;
  ac: number;
  speed: number;
}

export interface Monster {
  id: string;
  name: string;
  stats: MonsterStats;
  behavior: MonsterAction[];
}
