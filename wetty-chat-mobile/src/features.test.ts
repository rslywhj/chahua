import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feature gates', () => {
  it('keeps message search behind an explicit gate by default', async () => {
    vi.stubGlobal('__FEATURE_GATES_ENABLED__', false);
    const { FEATURES, isFeatureEnabled } = await import('./features');

    expect(FEATURES.messageSearch.enabled).toBe(false);
    expect(isFeatureEnabled('messageSearch')).toBe(false);
  });
});
