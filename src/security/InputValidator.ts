/**
 * Input Validator for Kensho
 * Implements strict input validation following parse-don't-validate principles
 * 
 * This module provides utilities for validating and sanitizing user inputs
 * to prevent injection attacks and other security vulnerabilities.
 */

export type ValidationError = {
  field: string;
  message: string;
  value: unknown;
};

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Base validator interface
 */
export interface Validator<T> {
  parse(input: unknown): ValidationResult<T>;
}

/**
 * String validator with sanitization
 */
export class StringValidator implements Validator<string> {
  private maxLength: number = 10000;
  private minLength: number = 0;
  private pattern?: RegExp;
  private trim: boolean = true;

  constructor(options?: { 
    maxLength?: number; 
    minLength?: number; 
    pattern?: RegExp;
    trim?: boolean;
  }) {
    if (options?.maxLength) this.maxLength = options.maxLength;
    if (options?.minLength) this.minLength = options.minLength;
    if (options?.pattern) this.pattern = options.pattern;
    if (options?.trim !== undefined) this.trim = options.trim;
  }

  parse(input: unknown): ValidationResult<string> {
    // Convert to string
    let value: string;
    if (input === null || input === undefined) {
      value = '';
    } else {
      value = String(input);
    }

    // Trim if requested
    if (this.trim) {
      value = value.trim();
    }

    // Check length constraints
    if (value.length < this.minLength) {
      return {
        success: false,
        errors: [{
          field: 'string',
          message: `String must be at least ${this.minLength} characters`,
          value: input
        }]
      };
    }

    if (value.length > this.maxLength) {
      return {
        success: false,
        errors: [{
          field: 'string',
          message: `String must be no more than ${this.maxLength} characters`,
          value: input
        }]
      };
    }

    // Check pattern if provided
    if (this.pattern && !this.pattern.test(value)) {
      return {
        success: false,
        errors: [{
          field: 'string',
          message: 'String does not match required pattern',
          value: input
        }]
      };
    }

    // Sanitize the string
    const sanitized = this.sanitize(value);
    
    return {
      success: true,
      data: sanitized
    };
  }

  private sanitize(input: string): string {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove < and > to prevent tag injection
      .replace(/["']/g, '') // Remove quotes to prevent attribute injection
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/data:/gi, ''); // Remove data: protocol (except for images which are handled separately)
  }
}

/**
 * Number validator
 */
export class NumberValidator implements Validator<number> {
  private min?: number;
  private max?: number;
  private integerOnly: boolean = false;

  constructor(options?: { 
    min?: number; 
    max?: number;
    integerOnly?: boolean;
  }) {
    if (options?.min !== undefined) this.min = options.min;
    if (options?.max !== undefined) this.max = options.max;
    if (options?.integerOnly) this.integerOnly = options.integerOnly;
  }

  parse(input: unknown): ValidationResult<number> {
    // Convert to number
    const value = Number(input);

    // Check if it's a valid number
    if (isNaN(value)) {
      return {
        success: false,
        errors: [{
          field: 'number',
          message: 'Value is not a valid number',
          value: input
        }]
      };
    }

    // Check integer constraint
    if (this.integerOnly && !Number.isInteger(value)) {
      return {
        success: false,
        errors: [{
          field: 'number',
          message: 'Value must be an integer',
          value: input
        }]
      };
    }

    // Check min constraint
    if (this.min !== undefined && value < this.min) {
      return {
        success: false,
        errors: [{
          field: 'number',
          message: `Value must be at least ${this.min}`,
          value: input
        }]
      };
    }

    // Check max constraint
    if (this.max !== undefined && value > this.max) {
      return {
        success: false,
        errors: [{
          field: 'number',
          message: `Value must be no more than ${this.max}`,
          value: input
        }]
      };
    }

    return {
      success: true,
      data: value
    };
  }
}

/**
 * Boolean validator
 */
export class BooleanValidator implements Validator<boolean> {
  parse(input: unknown): ValidationResult<boolean> {
    if (typeof input === 'boolean') {
      return { success: true, data: input };
    }

    if (input === 'true' || input === '1' || input === 1) {
      return { success: true, data: true };
    }

    if (input === 'false' || input === '0' || input === 0) {
      return { success: true, data: false };
    }

    return {
      success: false,
      errors: [{
        field: 'boolean',
        message: 'Value is not a valid boolean',
        value: input
      }]
    };
  }
}

/**
 * Array validator
 */
export class ArrayValidator<T> implements Validator<T[]> {
  private itemValidator: Validator<T>;
  private maxLength: number = 1000;

  constructor(itemValidator: Validator<T>, options?: { maxLength?: number }) {
    this.itemValidator = itemValidator;
    if (options?.maxLength) this.maxLength = options.maxLength;
  }

  parse(input: unknown): ValidationResult<T[]> {
    // Check if input is an array
    if (!Array.isArray(input)) {
      return {
        success: false,
        errors: [{
          field: 'array',
          message: 'Value is not an array',
          value: input
        }]
      };
    }

    // Check length constraint
    if (input.length > this.maxLength) {
      return {
        success: false,
        errors: [{
          field: 'array',
          message: `Array must contain no more than ${this.maxLength} items`,
          value: input
        }]
      };
    }

    // Validate each item
    const validatedItems: T[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < input.length; i++) {
      const itemResult = this.itemValidator.parse(input[i]);
      
      if (itemResult.success) {
        validatedItems.push(itemResult.data);
      } else {
        errors.push(...itemResult.errors.map((error: ValidationError) => ({
          ...error,
          field: `array[${i}].${error.field}`
        })));
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors
      };
    }

    return {
      success: true,
      data: validatedItems
    };
  }
}

/**
 * Object validator
 */
export class ObjectValidator<T extends Record<string, any>> implements Validator<T> {
  private shape: { [K in keyof T]: Validator<T[K]> };

  constructor(shape: { [K in keyof T]: Validator<T[K]> }) {
    this.shape = shape;
  }

  parse(input: unknown): ValidationResult<T> {
    // Check if input is an object
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        errors: [{
          field: 'object',
          message: 'Value is not an object',
          value: input
        }]
      };
    }

    const obj = input as Record<string, unknown>;
    const validatedObj: Record<string, unknown> = {};
    const errors: ValidationError[] = [];

    // Validate each field
    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldResult = validator.parse(obj[key]);
      
      if (fieldResult.success) {
        validatedObj[key] = fieldResult.data;
      } else {
        errors.push(...fieldResult.errors.map((error: ValidationError) => ({
          ...error,
          field: `${key}.${error.field}`
        })));
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors
      };
    }

    return {
      success: true,
      data: validatedObj as T
    };
  }
}

/**
 * Union validator for discriminated unions
 */
export class UnionValidator<T> implements Validator<T> {
  private validators: Validator<T>[];

  constructor(validators: Validator<T>[]) {
    this.validators = validators;
  }

  parse(input: unknown): ValidationResult<T> {
    const errors: ValidationError[] = [];

    for (const validator of this.validators) {
      const result = validator.parse(input);
      
      if (result.success) {
        return result;
      } else {
        errors.push(...result.errors);
      }
    }

    return {
      success: false,
      errors
    };
  }
}

/**
 * Helper functions for creating validators
 */
export const Validators = {
  string: (options?: { 
    maxLength?: number; 
    minLength?: number; 
    pattern?: RegExp;
    trim?: boolean;
  }) => new StringValidator(options),

  number: (options?: { 
    min?: number; 
    max?: number;
    integerOnly?: boolean;
  }) => new NumberValidator(options),

  boolean: () => new BooleanValidator(),

  array: <T>(itemValidator: Validator<T>, options?: { maxLength?: number }) => 
    new ArrayValidator(itemValidator, options),

  object: <T extends Record<string, any>>(shape: { [K in keyof T]: Validator<T[K]> }) => 
    new ObjectValidator(shape),

  union: <T>(validators: Validator<T>[]) => new UnionValidator(validators)
};