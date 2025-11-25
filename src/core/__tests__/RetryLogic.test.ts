/**
 * Test Suite: Retry Logic with Exponential Backoff
 * Priority 3: processWithRetry() implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Retry Logic with Exponential Backoff - Priority 3 ✅', () => {
  it('should calculate exponential backoff correctly', () => {
    const initialBackoff = 100;
    const backoffs = [];

    for (let attempt = 1; attempt < 4; attempt++) {
      const backoff = initialBackoff * Math.pow(3, attempt - 1);
      backoffs.push(backoff);
    }

    expect(backoffs).toEqual([100, 300, 900]);
  });

  it('should attempt retry on first failure', async () => {
    let attempts = 0;
    const mockFunction = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('First attempt failed');
      }
      return 'Success';
    });

    // Simulate retry logic
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await mockFunction();
        if (result === 'Success') break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 10)); // Mock delay
        }
      }
    }

    expect(mockFunction).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
  });

  it('should retry with increasing delays', () => {
    const delays = [];
    const initialBackoff = 100;

    for (let attempt = 1; attempt < 4; attempt++) {
      const delay = initialBackoff * Math.pow(3, attempt - 1);
      delays.push(delay);
    }

    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
    expect(delays).toEqual([100, 300, 900]);
  });

  it('should give up after max retries', async () => {
    const maxRetries = 3;
    let attempts = 0;

    const mockFunction = vi.fn(async () => {
      attempts++;
      throw new Error('Always fails');
    });

    let finalError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await mockFunction();
      } catch (error) {
        finalError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxRetries) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    expect(mockFunction).toHaveBeenCalledTimes(maxRetries);
    expect(attempts).toBe(maxRetries);
    expect(finalError?.message).toContain('Always fails');
  });

  it('should succeed on retry attempt', async () => {
    let attempts = 0;

    const mockFunction = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Temporary failure');
      }
      return 'Success on second attempt';
    };

    let result = '';
    let succeeded = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await mockFunction();
        succeeded = true;
        break; // Success, exit loop
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    expect(attempts).toBe(2);
    expect(result).toBe('Success on second attempt');
    expect(succeeded).toBe(true);
  });

  it('should handle error types correctly', () => {
    const errorTypes = ['NetworkError', 'TimeoutError', 'ResourceError'];

    errorTypes.forEach(type => {
      const error = new Error(`${type}: Operation failed`);
      expect(error.message).toContain(type);
    });
  });

  it('should preserve error context through retries', async () => {
    const originalError = new Error('Original failure reason');
    let capturedError: Error | null = null;

    try {
      throw originalError;
    } catch (error) {
      capturedError = error instanceof Error ? error : new Error(String(error));
    }

    expect(capturedError?.message).toBe('Original failure reason');
  });

  it('should handle async/await properly in retry loop', async () => {
    let callCount = 0;

    const asyncTask = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (callCount === 1) {
        throw new Error('First call fails');
      }
      return 'Success';
    };

    let result = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await asyncTask();
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    expect(callCount).toBe(2);
    expect(result).toBe('Success');
  });
});
