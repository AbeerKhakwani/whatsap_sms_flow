import { describe, it, expect } from 'vitest';
import { parseChest, parseHip, mergeMeasurements } from '../../lib/measurements.js';

describe('parseChest', () => {
  it('reads every separator style found in the store', () => {
    expect(parseChest('Medium | Chest: 20" | Waist: 17"')).toBe(20);
    expect(parseChest('Medium | Shoulder - 15.5” |  Chest - 21” |\nLength - 48"')).toBe(21);
    expect(parseChest('Extra Large | US - 16 | Shoulder: 38 | Bust: 38 | Length: 57')).toBe(38);
    expect(parseChest('Chest 22')).toBe(22);
    expect(parseChest('pit to pit: 19.5')).toBe(19.5);
  });

  it('returns null when there is no chest at all', () => {
    for (const s of ['Medium', '7-8 Years', 'M/L', '', null, undefined]) expect(parseChest(s)).toBeNull();
  });

  it('does not mistake another field for chest', () => {
    expect(parseChest('Shoulder: 15 | Length: 48')).toBeNull();
    expect(parseHip('Medium | Chest: 20"')).toBeNull();
  });
});

describe('mergeMeasurements', () => {
  // The regression that motivated this file: the old code rebuilt the string from
  // chest+hip alone, wiping 230 live products' size labels and other measurements.
  it('never blanks a populated field when chest and hip are empty', () => {
    expect(mergeMeasurements('Medium', {})).toBe('Medium');
    expect(mergeMeasurements('Medium | Chest: 20"', { chest: '', hip: '' })).toBe('Medium | Chest: 20"');
    expect(mergeMeasurements('M/L | Chest: 20" | Waist: 19" | Length: 32"', {}))
      .toBe('M/L | Chest: 20" | Waist: 19" | Length: 32"');
  });

  it('updates chest in place and keeps everything around it', () => {
    expect(mergeMeasurements('Medium | Shoulder - 15.5” |  Chest - 21” |\nLength - 48"', { chest: '22' }))
      .toBe('Medium | Shoulder - 15.5” |  Chest - 22" |\nLength - 48"');
    expect(mergeMeasurements('Extra Large | US - 16 | Shoulder: 38 | Bust: 38 | Length: 57', { chest: '19' }))
      .toBe('Extra Large | US - 16 | Shoulder: 38 | Bust: 19" | Length: 57');
  });

  it('appends a field that is genuinely absent', () => {
    expect(mergeMeasurements('M/L | Chest: 20"', { hip: '24.5' })).toBe('M/L | Chest: 20" | Hip: 24.5"');
    expect(mergeMeasurements('', { chest: '21' })).toBe('Chest: 21"');
    expect(mergeMeasurements('Medium', { chest: '20', hip: '24' })).toBe('Medium | Chest: 20" | Hip: 24"');
  });

  it('round-trips — merging a parsed value back changes nothing meaningful', () => {
    const s = 'Medium | Chest: 20" | Waist: 17"';
    expect(parseChest(mergeMeasurements(s, { chest: String(parseChest(s)) }))).toBe(20);
  });
});
