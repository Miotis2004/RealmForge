export type RollResult = { total: number; rolls: number[]; modifier: number; detail: string };

export function rollDie(sides: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

export function rollDice(expr: string, modifier = 0, rng: () => number = Math.random): RollResult {
  const trimmed = expr.trim();
  const match = /^([0-9]+)d([0-9]+)([+-]\s*[0-9]+)?$/i.exec(trimmed.replace(/\s+/g, ''));
  if (!match) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }

  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const exprModifier = match[3] ? Number.parseInt(match[3].replace(/\s+/g, ''), 10) : 0;
  const totalModifier = modifier + exprModifier;

  const rolls = Array.from({ length: count }, () => rollDie(sides, rng));
  const subtotal = rolls.reduce((sum, roll) => sum + roll, 0);
  const total = subtotal + totalModifier;
  const modifierText = totalModifier === 0 ? '' : totalModifier > 0 ? `+${totalModifier}` : `${totalModifier}`;
  const detail = `${count}d${sides}${modifierText} (${rolls.join(', ')})${modifierText}`;

  return {
    total,
    rolls,
    modifier: totalModifier,
    detail
  };
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}
