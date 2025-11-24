/**
 * Seed Script for Sprint 9 Demo
 * Populates Kensho's memory with demo facts for a realistic demonstration
 * 
 * Usage: npm run seed:demo
 * 
 * This script populates the knowledge graph with facts that will be used
 * in the demo to showcase fact-checking capabilities.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface DemoFact {
  id: string;
  type: 'user_stated' | 'document_extracted';
  content: string;
  source?: string;
  timestamp?: number;
}

const DEMO_FACTS: DemoFact[] = [
  {
    id: 'fact_phenix_project',
    type: 'user_stated',
    content: "Le nom de code du projet interne est 'Phénix'.",
    timestamp: Date.now() - 86400000 // 1 day ago
  },
  {
    id: 'fact_rust_creator',
    type: 'document_extracted',
    content: "Le langage de programmation Rust a été initialement conçu par Graydon Hoare chez Mozilla Research.",
    source: 'Wikipedia - Rust (langage)'
  },
  {
    id: 'fact_rust_performance',
    type: 'document_extracted',
    content: "Rust est réputé pour ses performances comparables à celles du C++, ce qui en fait un choix idéal pour les applications critiques.",
    source: 'Rust-lang.org'
  },
  {
    id: 'fact_rust_memory',
    type: 'document_extracted',
    content: "Rust offre la sécurité mémoire sans garbage collector, grâce à son système de propriété (ownership).",
    source: 'The Rust Book'
  },
  {
    id: 'fact_kensho_purpose',
    type: 'user_stated',
    content: "Kensho est un système multi-agent distribué conçu pour l'IA basée sur le navigateur avec LLM alimenté par WebGPU.",
    timestamp: Date.now()
  }
];

async function seedDemoData(): Promise<void> {
  console.log('🌱 Preparing demo data for Kensho demonstration...');
  console.log(`📊 Total facts to seed: ${DEMO_FACTS.length}`);

  // Create data directory
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });

  // Save facts to JSON file for browser-based loading
  const factsFile = join(dataDir, 'demo-facts.json');
  writeFileSync(factsFile, JSON.stringify(DEMO_FACTS, null, 2), 'utf-8');

  console.log(`✅ Demo facts prepared and saved to: ${factsFile}`);
  console.log('\n📝 Demo Scenarios Ready:');
  console.log('   1. Simple Query: "Quelle heure est-il ?" → Direct response');
  console.log('   2. Complex Query: "Le projet Dragon avance bien, mais j\'ai entendu dire que Rust était lent. Peux-tu me faire un résumé ?"');
  console.log('      Expected: Fact-checking will correct "Rust est lent" and verify project name');
  console.log('   3. UI Verification: Check JournalCognitif and SourcesFooter display\n');

  console.log('🚀 To use this data in the browser:');
  console.log('   - The facts are automatically loaded when initializing the knowledge graph');
  console.log('   - Seeds are stored in IndexedDB for persistence across sessions');
  console.log('   - Reset with: localStorage.clear() then reload\n');

  console.log('✨ Demo setup complete! Launch with: npm run dev');
}

// Run seed
seedDemoData().catch(error => {
  console.error('❌ Error seeding demo data:', error);
  process.exit(1);
});
