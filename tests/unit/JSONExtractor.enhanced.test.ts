/**
 * Tests améliorés pour JSONExtractor avec les nouvelles fonctionnalités:
 * - Support des guillemets simples
 * - Variations Markdown (```JSON, ```Json)
 * - Paramètre strictness
 */
import { describe, it, expect } from 'vitest';
import { JSONExtractor } from '../../src/core/oie/JSONExtractor';

describe('JSONExtractor - Enhanced Features', () => {
    describe('Markdown variations', () => {
        it('should extract from ```JSON (uppercase)', () => {
            const text = '```JSON\n{"name": "test", "value": 42}\n```';
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({ name: 'test', value: 42 });
        });

        it('should extract from ```Json (capitalized)', () => {
            const text = '```Json\n{"name": "test", "value": 42}\n```';
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({ name: 'test', value: 42 });
        });

        it('should extract from ``` json (with space)', () => {
            const text = '``` json\n{"name": "test", "value": 42}\n```';
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({ name: 'test', value: 42 });
        });

        it('should handle mixed case variations', () => {
            const text = '```jSON\n{"result": true}\n```';
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({ result: true });
        });
    });

    describe('Single quotes conversion (lenient mode)', () => {
        it('should convert single quotes to double quotes in lenient mode', () => {
            const text = "{'name': 'test', 'value': 42}";
            const result = JSONExtractor.extract(text, { strictness: 'lenient' });
            expect(result).toEqual({ name: 'test', value: 42 });
        });

        it('should handle nested single quotes', () => {
            const text = "{'user': {'name': 'John', 'age': 30}}";
            const result = JSONExtractor.extract(text, { strictness: 'lenient' });
            expect(result).toEqual({ user: { name: 'John', age: 30 } });
        });

        it('should fail on single quotes in strict mode', () => {
            const text = "{'name': 'test'}";
            const result = JSONExtractor.extract(text, { strictness: 'strict' });
            expect(result).toBeNull();
        });

        it('should disable single quote conversion when specified', () => {
            const text = "{'name': 'test'}";
            const result = JSONExtractor.extract(text, { 
                strictness: 'lenient', 
                convertSingleQuotes: false 
            });
            expect(result).toBeNull();
        });
    });

    describe('Complex payloads', () => {
        it('should handle deeply nested JSON', () => {
            const text = `
                Here's the result:
                \`\`\`json
                {
                    "level1": {
                        "level2": {
                            "level3": {
                                "level4": {
                                    "value": "deep"
                                }
                            }
                        }
                    }
                }
                \`\`\`
            `;
            const result = JSONExtractor.extract(text);
            expect(result.level1.level2.level3.level4.value).toBe('deep');
        });

        it('should handle arrays with objects', () => {
            const text = `{
                "users": [
                    {"name": "Alice", "age": 25},
                    {"name": "Bob", "age": 30},
                    {"name": "Charlie", "age": 35}
                ]
            }`;
            const result = JSONExtractor.extract(text);
            expect(result.users).toHaveLength(3);
            expect(result.users[0].name).toBe('Alice');
        });

        it('should handle mixed data types', () => {
            const text = `{
                "string": "hello",
                "number": 42,
                "boolean": true,
                "null": null,
                "array": [1, 2, 3],
                "object": {"nested": "value"}
            }`;
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({
                string: 'hello',
                number: 42,
                boolean: true,
                null: null,
                array: [1, 2, 3],
                object: { nested: 'value' }
            });
        });
    });

    describe('Edge cases with comments and noise', () => {
        it('should handle comments with single quotes in lenient mode', () => {
            const text = `
                // This is a comment with 'single quotes'
                {'data': 'value'} // Another comment
            `;
            const result = JSONExtractor.extract(text, { strictness: 'lenient' });
            expect(result).toEqual({ data: 'value' });
        });

        it('should handle block comments with special characters', () => {
            const text = `{
                /* Comment with special chars: !@#$%^&*() */
                "key": "value"
            }`;
            const result = JSONExtractor.extract(text);
            expect(result).toEqual({ key: 'value' });
        });

        it('should handle trailing commas with nested structures', () => {
            const text = `{
                "outer": {
                    "inner": [1, 2, 3,]
                },
            }`;
            const result = JSONExtractor.extract(text);
            expect(result.outer.inner).toEqual([1, 2, 3]);
        });
    });

    describe('Strictness modes', () => {
        it('should be lenient by default', () => {
            const text = "{'test': 'value'}";
            const result = JSONExtractor.extract(text);
            expect(result).not.toBeNull();
        });

        it('should reject malformed JSON in strict mode', () => {
            const text = "{'test': 'value'}";
            const result = JSONExtractor.extract(text, { strictness: 'strict' });
            expect(result).toBeNull();
        });

        it('should accept valid JSON in both modes', () => {
            const text = '{"test": "value"}';
            const lenientResult = JSONExtractor.extract(text, { strictness: 'lenient' });
            const strictResult = JSONExtractor.extract(text, { strictness: 'strict' });
            
            expect(lenientResult).toEqual({ test: 'value' });
            expect(strictResult).toEqual({ test: 'value' });
        });
    });

    describe('Real-world LLM outputs', () => {
        it('should extract from typical LLM response with explanation', () => {
            const text = `
                Based on your query, here's the structured data you requested:
                
                \`\`\`json
                {
                    "thought": "I need to analyze the user's request carefully",
                    "steps": [
                        {"action": "call", "method": "calculate", "args": ["2+2"]},
                        {"action": "respond", "message": "The result is 4"}
                    ]
                }
                \`\`\`
                
                This should solve your problem.
            `;
            const result = JSONExtractor.extract(text);
            expect(result.steps).toHaveLength(2);
            expect(result.thought).toBeTruthy();
        });

        it('should handle LLM output with mixed markdown and single quotes', () => {
            const text = `
                Here's the plan:
                \`\`\`JSON
                {
                    'analysis': 'This is complex',
                    'action': 'proceed'
                }
                \`\`\`
            `;
            const result = JSONExtractor.extract(text, { strictness: 'lenient' });
            expect(result).toEqual({
                analysis: 'This is complex',
                action: 'proceed'
            });
        });
    });
});
