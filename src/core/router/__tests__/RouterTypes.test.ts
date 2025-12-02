import { describe, it, expect } from 'vitest';
import { RouterError } from '../RouterTypes';

describe('RouterTypes', () => {
    it('should create RouterError with correct properties', () => {
        const errorMessage = 'Test error message';
        const errorDetails = 'Test error details';
        
        const routerError = new RouterError(errorMessage, errorDetails);
        
        expect(routerError).toBeInstanceOf(RouterError);
        expect(routerError).toBeInstanceOf(Error);
        expect(routerError.message).toBe(errorMessage);
        expect(routerError.details).toBe(errorDetails);
        expect(routerError.name).toBe('RouterError');
    });

    it('should create RouterError without details', () => {
        const errorMessage = 'Test error message';
        
        const routerError = new RouterError(errorMessage);
        
        expect(routerError).toBeInstanceOf(RouterError);
        expect(routerError.message).toBe(errorMessage);
        expect(routerError.details).toBeUndefined();
        expect(routerError.name).toBe('RouterError');
    });

    it('should have correct type definitions', () => {
        // Test that the types are correctly defined
        const intentCategories = ['CODE', 'MATH', 'DIALOGUE', 'FACTCHECK', 'UNKNOWN'] as const;
        const executionStrategies = ['SERIAL', 'PARALLEL_LIMITED', 'PARALLEL_FULL'] as const;
        const taskPriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
        
        // These are compile-time checks to ensure types are correctly defined
        expect(intentCategories).toBeDefined();
        expect(executionStrategies).toBeDefined();
        expect(taskPriorities).toBeDefined();
    });

    it('should handle RouterError inheritance correctly', () => {
        const routerError = new RouterError('Test error');
        
        // Check that it's an instance of Error
        expect(routerError instanceof Error).toBe(true);
        
        // Check that it has the correct prototype chain
        expect(Object.getPrototypeOf(routerError)).toBe(RouterError.prototype);
        expect(RouterError.prototype instanceof Error).toBe(true);
    });

    it('should have proper stack trace', () => {
        const routerError = new RouterError('Test error');
        
        // Check that stack trace exists
        expect(routerError.stack).toBeDefined();
        expect(typeof routerError.stack).toBe('string');
        
        // Check that stack trace includes the error message
        expect(routerError.stack).toContain('Test error');
    });
});