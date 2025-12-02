import { describe, it, expect } from 'vitest';
import { getModelBySpecialization, getAllVerifiedModels, validateModelExists } from '../ModelCatalog';

describe('ModelCatalog', () => {
    it('should get model by specialization', () => {
        const codeModel = getModelBySpecialization('code');
        expect(codeModel).toBeDefined();
        expect(codeModel?.specialization).toBe('code');
        
        const mathModel = getModelBySpecialization('math');
        expect(mathModel).toBeDefined();
        expect(mathModel?.specialization).toBe('math');
        
        const generalModel = getModelBySpecialization('general');
        expect(generalModel).toBeDefined();
        expect(generalModel?.specialization).toBe('general');
        
        const unknownModel = getModelBySpecialization('unknown');
        expect(unknownModel).toBeNull();
    });

    it('should get all models', () => {
        const allModels = getAllVerifiedModels();
        expect(allModels).toHaveLength(3);
        
        // Check that we have the expected models
        const modelIds = allModels.map(model => model.id);
        expect(modelIds).toContain('qwen2.5-coder-1.5b');
        expect(modelIds).toContain('gemma-3-270m-it-MLC-code');
        expect(modelIds).toContain('gemma-3-270m-it-MLC-general');
    });

    it('should get model by ID', () => {
        const codeModel = getModelById('qwen2.5-coder-1.5b');
        expect(codeModel).toBeDefined();
        expect(codeModel?.id).toBe('qwen2.5-coder-1.5b');
        
        const mathModel = getModelBySpecialization('math');
        expect(mathModel).toBeDefined();
        expect(mathModel?.model_id).toBe('Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC');
        
        const codeModel = getModelBySpecialization('code');
        expect(codeModel).toBeDefined();
        expect(codeModel?.model_id).toBe('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC');
        
        const dialogueModel = getModelBySpecialization('dialogue');
        expect(dialogueModel).toBeDefined();
        expect(dialogueModel?.model_id).toBe('gemma-3-270m-it-MLC');
        
        const unknownModel = validateModelExists('unknown-model-id');
        expect(unknownModel).toBe(false);
    });

    it('should validate model properties', () => {
        const codeModel = getModelBySpecialization('code');
        expect(codeModel).toBeDefined();
        
        if (codeModel) {
            expect(codeModel.id).toBeTruthy();
            expect(codeModel.name).toBeTruthy();
            expect(codeModel.description).toBeTruthy();
            expect(codeModel.specialization).toBe('code');
            expect(codeModel.capabilities).toBeDefined();
            expect(Array.isArray(codeModel.capabilities)).toBe(true);
            expect(codeModel.performance).toBeDefined();
            expect(typeof codeModel.performance).toBe('object');
        }
        
        const mathModel = getModelBySpecialization('math');
        expect(mathModel).toBeDefined();
        
        if (mathModel) {
            expect(mathModel.id).toBeTruthy();
            expect(mathModel.name).toBeTruthy();
            expect(mathModel.description).toBeTruthy();
            expect(mathModel.specialization).toBe('math');
            expect(mathModel.capabilities).toBeDefined();
            expect(Array.isArray(mathModel.capabilities)).toBe(true);
            expect(mathModel.performance).toBeDefined();
            expect(typeof mathModel.performance).toBe('object');
        }
    });

    it('should handle edge cases', () => {
        // Test with empty string
        const emptyModel = getModelBySpecialization('' as any);
        expect(emptyModel).toBeNull();
        
        // Test with null/undefined
        const nullModel = getModelBySpecialization(null as any);
        expect(nullModel).toBeNull();
        
        const undefinedModel = getModelBySpecialization(undefined as any);
        expect(undefinedModel).toBeNull();
        
        // Test with non-existent specialization
        const nonexistentModel = getModelBySpecialization('nonexistent' as any);
        expect(nonexistentModel).toBeNull();
    });
});