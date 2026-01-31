export type AdventureSummary = {
  adventureId: string;
  title: string;
  name?: string;
  description?: string;
  published: boolean;
  version?: number;
  startNodeId?: string;
};

export type AdventureNode = {
  nodeId: string;
  type: string;
  text?: string;
  options?: Array<{ text: string; nextNode: string }>;
  monsterIds?: string[];
  victoryNode?: string;
  defeatNode?: string;
  [key: string]: unknown;
};

export type Monster = {
  id: string;
  name: string;
  stats?: { hp?: number; ac?: number; speed?: number; [key: string]: unknown };
  behavior?: Array<{
    action?: string;
    condition?: string;
    priority?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};
