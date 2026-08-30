import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory stand-in for Redis so the claim logic is testable without one.
const store = new Map();
vi.mock('../../lib/cache.js', () => ({
  cacheGet: async k => (store.has(k) ? JSON.parse(store.get(k)) : null),
  cacheSet: async (k, v) => { store.set(k, JSON.stringify(v)); },
  cacheBust: async () => {},
}));

const { claim, release, getClaims, claimedByOthers } = await import('../../lib/deck-claims.js');

const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;

describe('deck claims', () => {
  beforeEach(() => store.clear());

  it('claims listings for one admin', async () => {
    expect(await claim(['1', '2'], 'a@x.com', T0)).toEqual(['1', '2']);
    expect(Object.keys(await getClaims(T0))).toEqual(['1', '2']);
  });

  it('will not steal a listing another admin holds', async () => {
    await claim(['1', '2'], 'a@x.com', T0);
    expect(await claim(['2', '3'], 'b@x.com', T0)).toEqual(['3']);
    const claims = await getClaims(T0);
    expect(claims['2'].admin).toBe('a@x.com');
  });

  it('hides only other people\'s claims', async () => {
    await claim(['1'], 'a@x.com', T0);
    await claim(['2'], 'b@x.com', T0);
    expect([...await claimedByOthers('a@x.com', T0)]).toEqual(['2']);
    expect([...await claimedByOthers('b@x.com', T0)]).toEqual(['1']);
  });

  it('expires claims so an abandoned batch returns to the queue', async () => {
    await claim(['1'], 'a@x.com', T0);
    expect(Object.keys(await getClaims(T0 + 19 * MIN))).toEqual(['1']);
    expect(Object.keys(await getClaims(T0 + 21 * MIN))).toEqual([]);
    // and someone else can now take it
    expect(await claim(['1'], 'b@x.com', T0 + 21 * MIN)).toEqual(['1']);
  });

  it('releases only your own claims', async () => {
    await claim(['1'], 'a@x.com', T0);
    await claim(['2'], 'b@x.com', T0);
    await release(['1', '2'], 'a@x.com', T0);
    expect(Object.keys(await getClaims(T0))).toEqual(['2']);
  });

  it('re-claiming your own listing refreshes it rather than failing', async () => {
    await claim(['1'], 'a@x.com', T0);
    expect(await claim(['1'], 'a@x.com', T0 + 10 * MIN)).toEqual(['1']);
    expect(Object.keys(await getClaims(T0 + 25 * MIN))).toEqual(['1']);
  });

  it('degrades to no-claims rather than throwing on bad input', async () => {
    expect(await claim([], 'a@x.com', T0)).toEqual([]);
    expect(await claim(['1'], null, T0)).toEqual([]);
    await expect(release(['1'], null, T0)).resolves.toBeUndefined();
  });
});
