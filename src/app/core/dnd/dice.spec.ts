import { abilityMod, rollDice } from './dice';

describe('dice helpers', () => {
  it('calculates ability modifiers', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(12)).toBe(1);
    expect(abilityMod(9)).toBe(-1);
  });

  it('rolls dice with modifiers', () => {
    const rng = sequenceRng([0.5, 0.0]);
    const result = rollDice('2d6+3', 0, rng);

    expect(result.rolls).toEqual([4, 1]);
    expect(result.total).toBe(8);
    expect(result.modifier).toBe(3);
  });
});

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}
