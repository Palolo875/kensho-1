/**
 * Demo Scenarios for Sprint 9 Integration Testing
 * 
 * These scenarios demonstrate the full capabilities of Kensho:
 * - Simple queries (no debate)
 * - Complex queries with fact-checking
 * - UI verification
 */

export const DEMO_SCENARIOS = {
  simple: {
    query: 'Quelle heure est-il ?',
    category: 'simple',
    expectedBehavior: 'Direct response, no debate, no journal',
    successCriteria: [
      'Response appears immediately',
      'No JournalCognitif displayed',
      'No sources footer shown'
    ]
  },

  complex: {
    query: "Le projet Dragon avance bien, mais j'ai entendu dire que Rust était lent. Peux-tu me faire un résumé ?",
    category: 'complex_with_factchecking',
    expectedBehavior: 'Full debate flow with fact-checking and correction',
    successCriteria: [
      'DebatePlan V2 generated (OptimistAgent → CriticAgent → FactCheckerAgent → Synthesis)',
      'Fact-checking identifies:',
      '  ✅ "Rust est lent" → CONTRADICTED (high confidence)',
      '  ✅ Project name correction from "Dragon" to "Phénix"',
      'Response shows nuanced language based on verification',
      'JournalCognitif displays with:',
      '  - 4 debate steps',
      '  - Verification step with icons (✅/❌/🟡/⚠️)',
      '  - Confidence scores for each claim',
      '  - Evidence sources displayed',
      'SourcesFooter shows consulted documents',
      'Total latency < 5s (includes LLM inference)'
    ],
    demoSteps: [
      '1. Post the query',
      '2. Wait for response (observe debate in real-time)',
      '3. Click 🧠 "Voir la réflexion" to expand JournalCognitif',
      '4. Inspect the "Vérification des Faits" step',
      '5. Check SourcesFooter below the message'
    ]
  },

  uiVerification: {
    category: 'ui_validation',
    checks: {
      journalCognitif: {
        description: 'JournalCognitif displays verification results correctly',
        items: [
          'Status icons present: ✅ VERIFIED, ❌ CONTRADICTED, 🟡 AMBIGUOUS, ⚠️ UNKNOWN',
          'Confidence scores displayed (0-100%)',
          'Evidence sources shown with truncated content',
          'Contradictory evidence section visible when applicable',
          'Step durations displayed correctly'
        ]
      },
      sourcesFooter: {
        description: 'ChatMessage SourcesFooter displays correctly',
        items: [
          '"Sources consultées :" label present',
          'Document badges with 📄 icon',
          'Truncated titles (max 30 chars)',
          'Tooltips show full titles on hover',
          'Clean styling with proper spacing'
        ]
      },
      responseQuality: {
        description: 'Response quality and nuance',
        items: [
          'Correction of false information about Rust',
          'Acknowledgment of project name discrepancy',
          'Nuanced language based on confidence scores',
          'Clear explanation of sources when needed'
        ]
      }
    }
  },

  edgeCases: {
    queries: [
      {
        text: 'Dis-moi des mensonges sur Rust',
        expected: 'System refuses or flags as unreliable'
      },
      {
        text: 'Combine Rust with [random_term]',
        expected: 'System handles gracefully, marks unknown items'
      },
      {
        text: 'Very long text with 50+ facts to extract',
        expected: 'System handles extraction without timeout'
      }
    ]
  }
};

export function printDemoGuide(): void {
  console.log('\n🎬 KENSHO SPRINT 9 DEMO GUIDE');
  console.log('================================\n');

  console.log('📋 SCENARIO 1: Simple Query');
  console.log(`Query: "${DEMO_SCENARIOS.simple.query}"`);
  console.log(`Expected: ${DEMO_SCENARIOS.simple.expectedBehavior}\n`);

  console.log('📋 SCENARIO 2: Complex Query with Fact-Checking (MAIN DEMO)');
  console.log(`Query: "${DEMO_SCENARIOS.complex.query}"`);
  console.log(`Expected: ${DEMO_SCENARIOS.complex.expectedBehavior}`);
  console.log('\nSteps to verify:');
  DEMO_SCENARIOS.complex.demoSteps.forEach(step => console.log(`  ${step}`));
  console.log('\nSuccess Criteria:');
  DEMO_SCENARIOS.complex.successCriteria.forEach(criteria => console.log(`  ✓ ${criteria}`));

  console.log('\n🔍 UI VERIFICATION CHECKLIST');
  Object.entries(DEMO_SCENARIOS.uiVerification.checks).forEach(([key, check]) => {
    console.log(`\n  ${check.description}:`);
    check.items.forEach(item => console.log(`    ☐ ${item}`));
  });

  console.log('\n✨ Demo Success = All criteria met + All UI elements visible + Transparent reasoning visible\n');
}

// Print guide if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  printDemoGuide();
}
