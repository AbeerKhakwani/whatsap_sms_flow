import { describe, it, expect } from 'vitest';
import { resolveCommission, SELLER_COMMISSION, DEFAULT_COMMISSION, CONCIERGE_COMMISSION } from '../../lib/commission.js';

describe('commission rules', () => {
  it('uses the house default when nothing else applies', () => {
    expect(resolveCommission({ sellerEmail: 'someone@else.com' })).toEqual({ rate: 18, reason: 'default' });
    expect(DEFAULT_COMMISSION).toBe(18);
  });

  it('charges the concierge rate when Phirstory ships it', () => {
    expect(resolveCommission({ sellerEmail: 'someone@else.com', isConcierge: true }))
      .toEqual({ rate: 40, reason: 'concierge' });
    expect(CONCIERGE_COMMISSION).toBe(40);
  });

  it('lets an agreed seller rate beat the concierge rate', () => {
    // The whole point of the precedence order: these two keep their rate on concierge items.
    expect(resolveCommission({ sellerEmail: 'cuebee64@aol.com', isConcierge: true }))
      .toEqual({ rate: 50, reason: 'seller' });
    expect(resolveCommission({ sellerEmail: 'nskhan9393@gmail.com', isConcierge: true }))
      .toEqual({ rate: 60, reason: 'seller' });
  });

  it('applies the agreed rate off concierge too', () => {
    expect(resolveCommission({ sellerEmail: 'nskhan9393@gmail.com' }).rate).toBe(60);
    expect(resolveCommission({ sellerEmail: 'cuebee64@aol.com' }).rate).toBe(50);
  });

  it('matches sellers regardless of case or stray whitespace', () => {
    expect(resolveCommission({ sellerEmail: '  NSKhan9393@Gmail.COM ' }).rate).toBe(60);
  });

  it('falls back safely when the seller is unknown or missing', () => {
    for (const e of [null, undefined, '', '   ']) {
      expect(resolveCommission({ sellerEmail: e })).toEqual({ rate: 18, reason: 'default' });
      expect(resolveCommission({ sellerEmail: e, isConcierge: true })).toEqual({ rate: 40, reason: 'concierge' });
    }
  });

  it('keeps override keys lowercase so lookups can never miss', () => {
    for (const k of Object.keys(SELLER_COMMISSION)) expect(k).toBe(k.toLowerCase());
  });
});
