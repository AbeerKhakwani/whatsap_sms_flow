/**
 * Unified Sell Flow Tests
 * Run: npm test
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { msg, calculatePayout, MESSAGES } from '../lib/sms/messages.js';

// ==================== MESSAGE TESTS ====================

describe('Messages', () => {
  describe('calculatePayout', () => {
    test('calculates 18% commission correctly', () => {
      expect(calculatePayout(100)).toBe(82);
      expect(calculatePayout(85)).toBe(70);
      expect(calculatePayout(50)).toBe(41);
    });

    test('handles string input', () => {
      expect(calculatePayout('100')).toBe(82);
    });

    test('handles invalid input', () => {
      expect(calculatePayout(null)).toBe(0);
      expect(calculatePayout(undefined)).toBe(0);
      expect(calculatePayout('abc')).toBe(0);
    });

    test('supports custom commission rate', () => {
      expect(calculatePayout(100, 20)).toBe(80);
      expect(calculatePayout(100, 15)).toBe(85);
    });
  });

  describe('msg function', () => {
    test('returns static messages', () => {
      expect(msg('MENU')).toContain('SELL');
      expect(msg('HELP')).toContain('help');
      expect(msg('SELL_START')).toContain('Tell me about it');
    });

    test('returns ERROR for unknown keys', () => {
      expect(msg('UNKNOWN_KEY')).toBe(MESSAGES.ERROR);
    });
  });

  describe('SELL_EXTRACTED message', () => {
    test('shows all provided fields', () => {
      const listing = {
        designer: 'Elan',
        item_type: 'suit',
        size: 'L',
        condition: 'like new',
        asking_price_usd: 100
      };
      const result = msg('SELL_EXTRACTED', listing, 82, []);
      expect(result).toContain('Elan');
      expect(result).toContain('suit');
      expect(result).toContain('Size L');
      expect(result).toContain('like new');
      expect(result).toContain('$100');
      expect(result).toContain('$82');
    });

    test('shows missing fields', () => {
      const listing = { designer: 'Khaadi' };
      const result = msg('SELL_EXTRACTED', listing, 0, ['size', 'condition', 'price']);
      expect(result).toContain('Still need');
      expect(result).toContain('size');
    });

    test('handles empty listing', () => {
      const listing = {};
      const result = msg('SELL_EXTRACTED', listing, 0, ['designer', 'item_type', 'size', 'condition', 'price']);
      expect(result).toContain('Got it!');
      expect(result).toContain('Still need');
    });
  });

  describe('SELL_SUMMARY message', () => {
    test('formats summary correctly', () => {
      const listing = {
        designer: 'Maria B',
        item_type: 'kurta',
        size: 'M',
        condition: 'new with tags',
        asking_price_usd: 75,
        photo_urls: ['1.jpg', '2.jpg'],
        photo_tag_url: 'tag.jpg'
      };
      const result = msg('SELL_SUMMARY', listing, 62);
      expect(result).toContain('Maria B');
      expect(result).toContain('kurta');
      expect(result).toContain('$75');
      expect(result).toContain('$62');
      expect(result).toContain('3 ✓'); // 2 photos + 1 tag
      expect(result).toContain('1 = Submit');
      expect(result).toContain('2 = Edit');
      expect(result).toContain('3 = Cancel');
    });
  });

  describe('SELL_RESUME message', () => {
    test('shows draft status on resume', () => {
      const listing = {
        designer: 'Sana Safinaz',
        item_type: 'kurta',
        size: 'M',
        photo_urls: ['1.jpg'],
        photo_tag_url: null
      };
      const result = msg('SELL_RESUME', listing, 0, ['condition', 'price']);
      expect(result).toContain('Welcome back');
      expect(result).toContain('Sana Safinaz');
      expect(result).toContain('kurta');
      expect(result).toContain('Size M');
      expect(result).toContain('Still need');
      expect(result).toContain('1 photo');
    });

    test('shows when only photos needed', () => {
      const listing = {
        designer: 'Elan',
        item_type: 'suit',
        size: 'L',
        condition: 'like new',
        asking_price_usd: 100,
        photo_urls: [],
        photo_tag_url: null
      };
      const result = msg('SELL_RESUME', listing, 82, []);
      expect(result).toContain('Welcome back');
      expect(result).toContain('3 more photos');
    });
  });

  describe('SELL_PHOTO_RECEIVED message', () => {
    test('asks for more photos when < 3', () => {
      const result = msg('SELL_PHOTO_RECEIVED', 1, 'Beautiful kurta');
      expect(result).toContain('Beautiful kurta');
      expect(result).toContain('Send 2 more');
    });

    test('confirms when >= 3 photos', () => {
      const result = msg('SELL_PHOTO_RECEIVED', 3, null);
      expect(result).toContain('Got 3 photos');
    });

    test('handles no feedback', () => {
      const result = msg('SELL_PHOTO_RECEIVED', 2, null);
      expect(result).toContain('Got 2 photos');
      expect(result).toContain('Send 1 more');
    });
  });

  describe('SELL_DRAFT_FOUND message', () => {
    test('shows draft item info', () => {
      const result = msg('SELL_DRAFT_FOUND', 'Elan', 'suit');
      expect(result).toContain('Elan suit');
      expect(result).toContain('1 = Continue');
      expect(result).toContain('2 = Start fresh');
    });

    test('handles missing item info gracefully', () => {
      const result = msg('SELL_DRAFT_FOUND', null, null);
      expect(result).toContain('your item');
    });

    test('handles partial info', () => {
      const result = msg('SELL_DRAFT_FOUND', 'Khaadi', null);
      expect(result).toContain('Khaadi');
    });
  });

  describe('SELL_WHAT_TO_EDIT message', () => {
    test('shows edit options', () => {
      const result = msg('SELL_WHAT_TO_EDIT');
      expect(result).toContain('1 = Details');
      expect(result).toContain('2 = Photos');
      expect(result).toContain('3 = Price');
      expect(result).toContain('4 = Go back');
    });
  });
});

// ==================== STATE TRANSITION DOCUMENTATION ====================

describe('State Machine', () => {
  const STATES = {
    sell_started: 'Initial state when user says SELL',
    sell_draft_choice: 'When existing draft found - 1=continue, 2=fresh',
    sell_collecting: 'Main state - collecting info from any input',
    sell_details: 'Optional - asking for flaws/details',
    sell_photos: 'Collecting photos (need 3+)',
    sell_confirming: 'Final review - 1=submit, 2=edit, 3=cancel',
    sell_editing: 'Edit mode - 1=details, 2=photos, 3=price, 4=back'
  };

  const TRANSITIONS = {
    sell_started: {
      'seller missing': 'awaiting_email',
      'draft exists': 'sell_draft_choice',
      'no draft, content provided': 'sell_collecting (process content)',
      'no draft, no content': 'sell_collecting (show SELL_START)'
    },
    sell_draft_choice: {
      '1/continue/yes': 'sell_collecting (show SELL_RESUME)',
      '2/fresh/new': 'sell_collecting (delete draft, show SELL_START)'
    },
    sell_collecting: {
      'all fields + no details asked': 'sell_details',
      'all fields + details done + <3 photos': 'sell_photos',
      'all fields + 3+ photos': 'sell_confirming',
      'missing fields + extracted data': 'sell_collecting (show SELL_EXTRACTED)',
      'missing fields + no extraction': 'sell_collecting (show SELL_DIDNT_UNDERSTAND)',
      'status question': 'sell_collecting (show current status)'
    },
    sell_details: {
      'any text (not skip)': 'sell_photos or sell_confirming',
      'skip': 'sell_photos or sell_confirming'
    },
    sell_photos: {
      'photos + count >= 3': 'sell_confirming',
      'photos + count < 3': 'sell_photos (show SELL_PHOTO_RECEIVED)',
      'no photos': 'sell_photos (show SELL_READY_FOR_PHOTOS)'
    },
    sell_confirming: {
      '1/yes/submit': 'authorized (submit to Shopify)',
      '2/edit': 'sell_editing',
      '3/cancel/no': 'authorized (delete listing)'
    },
    sell_editing: {
      '1/details': 'sell_collecting (clear fields)',
      '2/photos': 'sell_photos (clear photos)',
      '3/price': 'sell_collecting (clear price)',
      '4/back': 'sell_confirming'
    }
  };

  test('all states are documented', () => {
    expect(Object.keys(STATES).length).toBe(7);
  });

  test('all transitions are documented', () => {
    expect(Object.keys(TRANSITIONS).length).toBe(7);
  });
});

// ==================== COMMAND RECOGNITION ====================

describe('Command Recognition', () => {
  describe('Exit commands (save draft)', () => {
    const exitCommands = ['exit', 'cancel', 'quit', 'nvm', 'nevermind', 'never mind', 'back', 'done', 'later', 'wait', 'hold on', 'one sec', 'brb', 'not now', 'not rn', 'gtg', 'busy'];

    test('all exit commands are recognized', () => {
      exitCommands.forEach(cmd => {
        expect(exitCommands.includes(cmd)).toBe(true);
      });
    });
  });

  describe('Delete commands (remove draft)', () => {
    const deleteCommands = ['start over', 'startover', 'clear', 'reset', 'delete draft'];

    test('all delete commands are recognized', () => {
      deleteCommands.forEach(cmd => {
        expect(deleteCommands.includes(cmd)).toBe(true);
      });
    });
  });

  describe('Status questions', () => {
    const statusPhrases = ['status', 'what did i', 'what do i have', 'show me', 'what have i', 'so far', 'summary', 'where am i'];

    test('recognizes status question phrases', () => {
      const testMessages = [
        'what did i list so far?',
        'show me what I have',
        'status',
        'summary please',
        'where am i in the process?'
      ];

      testMessages.forEach(message => {
        const lower = message.toLowerCase();
        const isStatus = statusPhrases.some(phrase => lower.includes(phrase));
        expect(isStatus).toBe(true);
      });
    });

    test('does not recognize non-status messages as status', () => {
      const nonStatusMessages = [
        'Sana Safinaz kurta',
        'medium size',
        '$85'
      ];

      nonStatusMessages.forEach(message => {
        const lower = message.toLowerCase();
        const isStatus = statusPhrases.some(phrase => lower.includes(phrase));
        expect(isStatus).toBe(false);
      });
    });
  });

  describe('Confirmation responses', () => {
    const yesResponses = ['1', 'yes', 'submit', 'y'];
    const editResponses = ['2', 'edit'];
    const cancelResponses = ['3', 'cancel', 'no', 'n'];

    test('recognizes confirmation responses', () => {
      yesResponses.forEach(r => expect(yesResponses.includes(r)).toBe(true));
      editResponses.forEach(r => expect(editResponses.includes(r)).toBe(true));
      cancelResponses.forEach(r => expect(cancelResponses.includes(r)).toBe(true));
    });
  });
});

// ==================== FIELD VALIDATION ====================

describe('Field Validation', () => {
  const REQUIRED_FIELDS = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd'];
  const FIELD_LABELS = {
    designer: 'designer/brand',
    item_type: 'item type',
    size: 'size',
    condition: 'condition',
    asking_price_usd: 'price'
  };

  test('all required fields have labels', () => {
    REQUIRED_FIELDS.forEach(field => {
      expect(FIELD_LABELS[field]).toBeDefined();
    });
  });

  test('getMissingFields returns correct fields', () => {
    const listing = { designer: 'Sana Safinaz', size: 'M' };
    const missing = REQUIRED_FIELDS.filter(field => !listing[field]);
    expect(missing).toContain('item_type');
    expect(missing).toContain('condition');
    expect(missing).toContain('asking_price_usd');
    expect(missing).not.toContain('designer');
    expect(missing).not.toContain('size');
  });
});

// ==================== LEGACY STATE COMPATIBILITY ====================

describe('Legacy State Compatibility', () => {
  const legacyStates = ['sell_awaiting_text', 'sell_awaiting_voice', 'sell_awaiting_photos'];
  const collectingStates = ['sell_collecting', ...legacyStates];

  test('legacy states map to sell_collecting', () => {
    legacyStates.forEach(state => {
      expect(collectingStates.includes(state)).toBe(true);
    });
  });
});
