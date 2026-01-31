import { RollResult, rollDie, rollDice } from './dice';

export type AttackResolution = {
  attackRoll: RollResult;
  hit: boolean;
  critical: boolean;
  damageRoll?: RollResult;
  targetAc: number;
};

export type DeathSaveResolution = {
  roll: RollResult;
  successes: number;
  failures: number;
  revived: boolean;
  stabilized: boolean;
  dead: boolean;
};

export function resolveAttack(params: {
  attackerAttackBonus: number;
  targetAc: number;
  damageDice: string;
  damageBonus: number;
  rng?: () => number;
}): AttackResolution {
  const rng = params.rng ?? Math.random;
  const d20 = rollDie(20, rng);
  const attackRoll: RollResult = {
    total: d20 + params.attackerAttackBonus,
    rolls: [d20],
    modifier: params.attackerAttackBonus,
    detail: `d20 (${d20})${formatModifier(params.attackerAttackBonus)}`
  };

  const critical = d20 === 20;
  const autoMiss = d20 === 1;
  const hit = critical || (!autoMiss && attackRoll.total >= params.targetAc);
  let damageRoll: RollResult | undefined;

  if (hit) {
    const damageExpr = critical ? doubleDice(params.damageDice) : params.damageDice;
    damageRoll = rollDice(damageExpr, params.damageBonus, rng);
  }

  return {
    attackRoll,
    hit,
    critical,
    damageRoll,
    targetAc: params.targetAc
  };
}

export function resolveDeathSave(
  current: { successes: number; failures: number },
  rng?: () => number
): DeathSaveResolution {
  const roll = rollDice('1d20', 0, rng ?? Math.random);
  let successes = current.successes;
  let failures = current.failures;
  let revived = false;

  const natural = roll.rolls[0];
  if (natural === 1) {
    failures += 2;
  } else if (natural === 20) {
    revived = true;
    successes = 0;
    failures = 0;
  } else if (roll.total >= 10) {
    successes += 1;
  } else {
    failures += 1;
  }

  const dead = failures >= 3;
  const stabilized = successes >= 3;

  return {
    roll,
    successes,
    failures,
    revived,
    stabilized,
    dead
  };
}

function doubleDice(expr: string): string {
  const match = /^([0-9]+)d([0-9]+)$/i.exec(expr.trim());
  if (!match) {
    return expr;
  }
  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  return `${count * 2}d${sides}`;
}

function formatModifier(modifier: number): string {
  if (modifier === 0) return '';
  return modifier > 0 ? `+${modifier}` : `${modifier}`;
}
