import { describe, it, expect } from 'vitest';
import { CONDITIONS, CONDITION_LABELS, canonicalCondition, isConditionTag } from '../../lib/conditions.js';

describe('condition taxonomy', () => {
  it('has exactly the five agreed values, best to worst', () => {
    expect(CONDITIONS).toEqual(['NWT', 'NWOT', 'Like New', 'Very Good', 'Fair']);
  });

  it('labels every canonical value', () => {
    for (const c of CONDITIONS) expect(CONDITION_LABELS[c]).toBeTruthy();
  });

  it('names the worn-but-sound tier below Like New, not above it', () => {
    // "Excellent" read as better than "Like New", which is backwards. Very Good ranks correctly.
    expect(CONDITIONS.indexOf('Very Good')).toBeGreaterThan(CONDITIONS.indexOf('Like New'));
    expect(CONDITIONS).not.toContain('Excellent');
    expect(canonicalCondition('Excellent')).toBe('Very Good');
  });

  it('is idempotent — canonical values resolve to themselves', () => {
    for (const c of CONDITIONS) expect(canonicalCondition(c)).toBe(c);
  });
});

describe('canonicalCondition', () => {
  it('normalises the historical spellings found in the store', () => {
    const cases = {
      'New with tags': 'NWT', 'NWT': 'NWT', 'Brand New': 'NWT', 'new w/tags': 'NWT',
      'New Without Tags': 'NWOT', 'NWOT': 'NWOT', 'new without tags': 'NWOT',
      'Like new': 'Like New', 'like-new': 'Like New',
      'Excellent': 'Very Good', 'Very Good': 'Very Good', 'Very good': 'Very Good',
      'Good': 'Very Good', 'Gently used': 'Very Good', 'EUC': 'Very Good',
      'Fair': 'Fair', 'Used': 'Fair',
    };
    for (const [raw, want] of Object.entries(cases)) {
      expect(`${raw} -> ${canonicalCondition(raw)}`).toBe(`${raw} -> ${want}`);
    }
  });

  it('never confuses NWOT with NWT — the prefix trap', () => {
    expect(canonicalCondition('New without tags')).toBe('NWOT');
    expect(canonicalCondition('NWOT - New Without Tags')).toBe('NWOT');
    expect(canonicalCondition('New Without Tags. - Slight pen mark on jacket')).toBe('NWOT');
    expect(canonicalCondition('NWT - New With Tags')).toBe('NWT');
  });

  it('reads a grade out of the free-text metafield, notes and all', () => {
    expect(canonicalCondition('Very Good - Minimum signs of wear\n*tiny hole on top of shalwar')).toBe('Very Good');
    expect(canonicalCondition('Good - small pen stain near the top. See picture')).toBe('Very Good');
    expect(canonicalCondition('Like New- no signs of wear')).toBe('Like New');
    expect(canonicalCondition('Very good no tears or threads sticking out.')).toBe('Very Good');
    expect(canonicalCondition('Like new | Little to no signs of wear')).toBe('Like New');
    expect(canonicalCondition('Excellent condition, pre owned wore for a couple of hours')).toBe('Very Good');
  });

  it('returns null rather than guessing when there is no grade', () => {
    for (const junk of ['', null, undefined, 'Item Has been Sold', 'Default Title', 'Shirt and Dupatta']) {
      expect(canonicalCondition(junk)).toBeNull();
    }
  });

  it('requires a word boundary so it cannot match inside another word', () => {
    expect(canonicalCondition('Newport blue kurta')).toBeNull();
    expect(canonicalCondition('Fairfield silk')).toBeNull();
  });
});

describe('isConditionTag', () => {
  it('matches condition tags exactly, never as a prefix', () => {
    for (const t of ['Like New', 'Like new', 'Very Good', 'Good', 'NWT', 'NWOT', 'New with tags', 'Fair', 'Excellent']) {
      expect(`${t}: ${isConditionTag(t)}`).toBe(`${t}: true`);
    }
  });

  it('leaves unrelated tags alone', () => {
    // "New Arrivals" is a merchandising tag and must survive the migration.
    for (const t of ['New Arrivals', 'Karma', 'Semi-Formal', 'concierge', 'preloved', 'women', 'Medium', 'sale', '']) {
      expect(`${t}: ${isConditionTag(t)}`).toBe(`${t}: false`);
    }
  });
});
