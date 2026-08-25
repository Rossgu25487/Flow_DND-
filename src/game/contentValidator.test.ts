import { describe, expect, it } from 'vitest';
import { ashenBeaconPack } from '../content/ashenBeacon';
import { fixturePack } from '../content/fixturePack';
import { validateContentPack } from './contentValidator';

describe('content pack validation', () => {
  it('accepts the playable Ashen Beacon pack', () => {
    expect(validateContentPack(ashenBeaconPack)).toEqual({ valid: true, errors: [] });
  });

  it('accepts the second no-code fixture pack', () => {
    expect(validateContentPack(fixturePack)).toEqual({ valid: true, errors: [] });
  });

  it('reports broken story references', () => {
    const broken = structuredClone(fixturePack);
    broken.contracts[0].story[0].next = 'missing-node';
    const result = validateContentPack(broken);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing-node');
  });
});
