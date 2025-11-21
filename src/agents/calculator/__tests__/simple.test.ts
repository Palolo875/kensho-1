import { describe, it, expect } from 'vitest';

describe('Simple test to verify config works', () => {
    it('should run basic arithmetic', () => {
        expect(2 + 2).toBe(4);
    });
    
    it('should run basic string operations', () => {
        expect('hello'.toUpperCase()).toBe('HELLO');
    });
});
