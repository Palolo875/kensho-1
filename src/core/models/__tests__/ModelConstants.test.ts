import { MODEL_KEYS } from '../ModelConstants';
import { describe, expect, it } from 'vitest';

describe('ModelConstants', () => {
  it('should define correct model keys', () => {
    expect(MODEL_KEYS.CODE_EXPERT).toBe('qwen2.5-coder-1.5b');
    expect(MODEL_KEYS.MATH_EXPERT).toBe('gemma-3-270m-it-MLC');
    expect(MODEL_KEYS.GENERAL_DIALOGUE).toBe('gemma-3-270m-it-MLC');
  });

  it('should have unique model keys', () => {
    const values = Object.values(MODEL_KEYS);
    const uniqueValues = [...new Set(values)];
    expect(values.length).toBe(uniqueValues.length);
  });

  it('should not have empty model keys', () => {
    Object.values(MODEL_KEYS).forEach(key => {
      expect(key).toBeTruthy();
      expect(key).not.toBe('');
    });
  });
});