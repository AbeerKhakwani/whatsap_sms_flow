import { describe, it, expect } from 'vitest';

// Validation logic extracted from whatsapp-flow.js
const VALID_ENUMS = {
  pieces: ['Kurta', '2-piece', '3-piece', 'Lehnga Set', 'Saree', 'Sharara Set', 'Gharara Set', 'Anarkali', 'Maxi', 'Other'],
  style: ['Formal', 'Bridal', 'Party Wear', 'Casual', 'Traditional', 'Semi-Formal', 'Festive', 'Other'],
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'],
  condition: ['New with tags', 'Like new', 'Excellent', 'Good', 'Fair']
};

function validateFlowData(data) {
  const errors = [];

  if (!data.designer || data.designer.trim().length < 2) {
    errors.push({ field: 'designer', message: 'Designer/Brand is required' });
  }

  if (!data.pieces) {
    errors.push({ field: 'pieces', message: 'Outfit type is required' });
  } else if (!VALID_ENUMS.pieces.includes(data.pieces)) {
    errors.push({ field: 'pieces', message: 'Invalid outfit type' });
  } else if (data.pieces === 'Other' && !data.pieces_other?.trim()) {
    errors.push({ field: 'pieces_other', message: 'Please specify the outfit type' });
  }

  if (!data.style) {
    errors.push({ field: 'style', message: 'Occasion/Style is required' });
  } else if (!VALID_ENUMS.style.includes(data.style)) {
    errors.push({ field: 'style', message: 'Invalid style' });
  } else if (data.style === 'Other' && !data.style_other?.trim()) {
    errors.push({ field: 'style_other', message: 'Please specify the occasion' });
  }

  if (!data.size) {
    errors.push({ field: 'size', message: 'Size is required' });
  } else if (!VALID_ENUMS.size.includes(data.size)) {
    errors.push({ field: 'size', message: 'Invalid size' });
  }

  if (!data.condition) {
    errors.push({ field: 'condition', message: 'Condition is required' });
  } else if (!VALID_ENUMS.condition.includes(data.condition)) {
    errors.push({ field: 'condition', message: 'Invalid condition' });
  }

  if (!data.asking_price) {
    errors.push({ field: 'asking_price', message: 'Asking price is required' });
  } else {
    const price = parseFloat(data.asking_price);
    if (isNaN(price) || price <= 0) {
      errors.push({ field: 'asking_price', message: 'Price must be greater than 0' });
    } else if (price > 10000) {
      errors.push({ field: 'asking_price', message: 'Price seems too high (max $10,000)' });
    }
  }

  if (data.original_price) {
    const origPrice = parseFloat(data.original_price);
    if (isNaN(origPrice) || origPrice <= 0) {
      errors.push({ field: 'original_price', message: 'Original price must be a valid number' });
    }
  }

  return { valid: errors.length === 0, errors };
}

describe('WhatsApp Flow Validation', () => {
  describe('Required Fields', () => {
    it('should reject empty designer', () => {
      const data = {
        designer: '',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'designer',
        message: 'Designer/Brand is required'
      });
    });

    it('should reject designer with less than 2 characters', () => {
      const data = {
        designer: 'X',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });

    it('should require all mandatory fields', () => {
      const data = {};

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Enum Validation', () => {
    it('should reject invalid pieces enum', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: 'INVALID_TYPE',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'pieces',
        message: 'Invalid outfit type'
      });
    });

    it('should accept all valid pieces values', () => {
      const validPieces = ['Kurta', '2-piece', '3-piece', 'Lehnga Set', 'Saree'];

      validPieces.forEach(piece => {
        const data = {
          designer: 'Sana Safinaz',
          pieces: piece,
          style: 'Formal',
          size: 'M',
          condition: 'Like new',
          asking_price: '95'
        };

        const result = validateFlowData(data);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid style enum', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'INVALID_STYLE',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });

    it('should reject invalid size enum', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'INVALID',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });

    it('should reject invalid condition enum', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'INVALID',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });
  });

  describe('Other Option Handling', () => {
    it('should require pieces_other when pieces is Other', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: 'Other',
        pieces_other: '',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'pieces_other',
        message: 'Please specify the outfit type'
      });
    });

    it('should require style_other when style is Other', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Other',
        style_other: '',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'style_other',
        message: 'Please specify the occasion'
      });
    });

    it('should accept pieces Other with pieces_other filled', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: 'Other',
        pieces_other: 'Palazzo Set',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(true);
    });
  });

  describe('Price Validation', () => {
    it('should enforce minimum price > 0', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '0'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'asking_price',
        message: 'Price must be greater than 0'
      });
    });

    it('should enforce maximum price <= 10000', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '99999'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'asking_price',
        message: 'Price seems too high (max $10,000)'
      });
    });

    it('should reject non-numeric price', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: 'free'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });

    it('should accept valid prices', () => {
      const validPrices = ['1', '50', '100', '500', '1000', '9999'];

      validPrices.forEach(price => {
        const data = {
          designer: 'Sana Safinaz',
          pieces: '3-piece',
          style: 'Formal',
          size: 'M',
          condition: 'Like new',
          asking_price: price
        };

        const result = validateFlowData(data);
        expect(result.valid).toBe(true);
      });
    });

    it('should validate original_price if provided', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95',
        original_price: 'invalid'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(false);
    });
  });

  describe('Complete Valid Data', () => {
    it('should pass with all required fields', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with all fields including optional ones', () => {
      const data = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95',
        color: 'Maroon with gold',
        material: 'Chiffon',
        original_price: '250',
        additional_details: 'Worn once for a wedding'
      };

      const result = validateFlowData(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
