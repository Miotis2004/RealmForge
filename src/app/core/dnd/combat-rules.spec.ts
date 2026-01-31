import { resolveAttack, resolveDeathSave } from './combat-rules';

describe('combat rules', () => {
  it('resolves critical hits with doubled dice', () => {
    const rng = sequenceRng([0.95, 0.1, 0.2]);
    const result = resolveAttack({
      attackerAttackBonus: 5,
      targetAc: 15,
      damageDice: '1d8',
      damageBonus: 3,
      rng
    });

    expect(result.critical).toBeTrue();
    expect(result.hit).toBeTrue();
    expect(result.damageRoll?.rolls.length).toBe(2);
    expect(result.damageRoll?.total).toBe(1 + 2 + 3);
  });

  it('tracks death save failures and successes', () => {
    const failRoll = resolveDeathSave({ successes: 0, failures: 0 }, sequenceRng([0.0]));
    expect(failRoll.failures).toBe(2);
    expect(failRoll.dead).toBeFalse();

    const successRoll = resolveDeathSave({ successes: 2, failures: 1 }, sequenceRng([0.6]));
    expect(successRoll.successes).toBe(3);
    expect(successRoll.stabilized).toBeTrue();
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
