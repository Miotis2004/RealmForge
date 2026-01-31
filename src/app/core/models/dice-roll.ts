export type DiceRollRequest = {
  id: string;
  label: string;
  expression: string;
  modifier?: number;
  context?: {
    combatId?: string;
    actorId?: string;
    targetId?: string;
    kind?: string;
  };
};

export type DiceRollResult = {
  id: string;
  total: number;
  rolls: number[];
  natural?: number;
};
