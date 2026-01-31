export type CombatantSide = 'hero' | 'monster';

export type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

export type Combatant = {
  id: string;
  name: string;
  side: CombatantSide;
  ac: number;
  maxHp: number;
  hp: number;
  speed?: number;
  abilities: AbilityScores;
  initiative: number;
  alive: boolean;
  unconscious?: boolean;
  deathSaves?: { successes: number; failures: number };
  attack?: { bonus: number; damageDice: string; damageBonus: number; label: string };
};

export type CombatLogEntry = {
  ts: number;
  text: string;
  payload?: unknown;
};

export type CombatState = {
  active: boolean;
  adventureId: string;
  nodeId: string;
  round: number;
  turnIndex: number;
  order: Combatant[];
  log: CombatLogEntry[];
  victoryNodeId?: string;
  defeatNodeId?: string;
};

export type HeroSnapshot = {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: AbilityScores;
};
