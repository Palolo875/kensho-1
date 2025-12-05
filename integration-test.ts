// Simple integration test to verify the refactored architecture
import { taskExecutor } from './src/core/kernel/TaskExecutor';
import { runtimeManager } from './src/core/kernel/RuntimeManager';
import { storageManager } from './src/core/kernel/StorageManager';
import { inputFilter } from './src/core/kernel/guardrails/InputFilter';
import { outputGuard } from './src/core/kernel/guardrails/OutputGuard';
import { rateLimiter } from './src/core/kernel/guardrails/RateLimiter';
import { auditLogger } from './src/core/kernel/guardrails/AuditLogger';
import { watermarkingService } from './src/core/kernel/guardrails/WatermarkingService';

async function runIntegrationTest() {
  console.log('🧪 Starting Integration Test...');
  
  try {
    // Test 1: Verify all services are properly exported and have the correct interface
    console.log('\n📋 Testing Service Interfaces...');
    
    const services = [
      { name: 'TaskExecutor', service: taskExecutor },
      { name: 'RuntimeManager', service: runtimeManager },
      { name: 'StorageManager', service: storageManager },
      { name: 'InputFilter', service: inputFilter },
      { name: 'OutputGuard', service: outputGuard },
      { name: 'RateLimiter', service: rateLimiter },
      { name: 'AuditLogger', service: auditLogger },
      { name: 'WatermarkingService', service: watermarkingService }
    ];
    
    for (const { name, service } of services) {
      // Check basic properties
      if (!service) {
        throw new Error(`${name} is not properly exported`);
      }
      
      console.log(`✅ ${name} is properly exported`);
    }
    
    // Test 2: Verify GuardrailService interface compliance
    console.log('\n🛡️ Testing GuardrailService Interface Compliance...');
    
    const guardrailServices = [
      { name: 'InputFilter', service: inputFilter },
      { name: 'OutputGuard', service: outputGuard },
      { name: 'RateLimiter', service: rateLimiter },
      { name: 'AuditLogger', service: auditLogger },
      { name: 'WatermarkingService', service: watermarkingService }
    ];
    
    for (const { name, service } of guardrailServices) {
      // Check required properties
      if (typeof service.serviceName !== 'string') {
        throw new Error(`${name} missing serviceName property`);
      }
      
      if (typeof service.version !== 'string') {
        throw new Error(`${name} missing version property`);
      }
      
      // Check required methods
      if (typeof service.initialize !== 'function') {
        throw new Error(`${name} missing initialize method`);
      }
      
      if (typeof service.shutdown !== 'function') {
        throw new Error(`${name} missing shutdown method`);
      }
      
      if (typeof service.getStats !== 'function') {
        throw new Error(`${name} missing getStats method`);
      }
      
      if (typeof service.resetStats !== 'function') {
        throw new Error(`${name} missing resetStats method`);
      }
      
      console.log(`✅ ${name} implements GuardrailService interface correctly`);
    }
    
    // Test 3: Test basic functionality
    console.log('\n⚡ Testing Basic Functionality...');
    
    // Test input validation
    const safePrompt = 'What is the weather today?';
    const validationResult = inputFilter.validate(safePrompt);
    if (!validationResult.safe) {
      throw new Error('InputFilter failed to validate safe prompt');
    }
    console.log('✅ InputFilter validates safe prompts correctly');
    
    // Test output sanitization
    const cleanResponse = 'The weather is sunny today.';
    const sanitizationResult = outputGuard.sanitize(cleanResponse);
    if (sanitizationResult.modified) {
      throw new Error('OutputGuard incorrectly modified clean response');
    }
    console.log('✅ OutputGuard handles clean responses correctly');
    
    // Test rate limiting
    const rateLimitResult = rateLimiter.isAllowed('test-user');
    if (!rateLimitResult.allowed) {
      throw new Error('RateLimiter incorrectly blocked valid request');
    }
    console.log('✅ RateLimiter allows valid requests');
    
    // Test watermarking
    const watermarkResult = watermarkingService.apply(cleanResponse, {
      modelId: 'test-model',
      sessionId: 'test-session'
    });
    if (!watermarkResult.watermarkedText || !watermarkResult.contentHash) {
      throw new Error('WatermarkingService failed to apply watermark');
    }
    console.log('✅ WatermarkingService applies watermarks correctly');
    
    // Test audit logging
    const auditEventsBefore = auditLogger.getRecentEvents().length;
    auditLogger.logSecurityEvent('TEST_EVENT', { test: 'data' });
    const auditEventsAfter = auditLogger.getRecentEvents().length;
    if (auditEventsAfter <= auditEventsBefore) {
      throw new Error('AuditLogger failed to log events');
    }
    console.log('✅ AuditLogger records security events');
    
    console.log('\n🎉 All Integration Tests Passed!');
    console.log('✅ Architecture refactoring is complete and functioning correctly');
    
    return true;
  } catch (error) {
    console.error('\n❌ Integration Test Failed:');
    console.error(error);
    return false;
  }
}

// Run the test
runIntegrationTest().then(success => {
  process.exit(success ? 0 : 1);
});