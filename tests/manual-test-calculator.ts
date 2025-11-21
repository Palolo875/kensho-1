import { evaluateExpression } from '../src/agents/calculator/logic';

console.log('🧪 Test manuel du CalculatorAgent (Version Améliorée)\n');
console.log('═'.repeat(60));

const tests = [
    { expr: '2+2', expected: 4, desc: 'Addition simple' },
    { expr: '3 * 4', expected: 12, desc: 'Multiplication' },
    { expr: 'sqrt(16)', expected: 4, desc: 'Racine carrée' },
    { expr: '2 * (3 + 4)^2', expected: 98, desc: 'Expression complexe' },
    { expr: 'sin(0)', expected: 0, desc: 'Fonction trigonométrique' },
    { expr: 'abs(-5)', expected: 5, desc: 'Valeur absolue' },
    { expr: 'min(3, 7, 2)', expected: 2, desc: 'Fonction min' },
    { expr: 'max(3, 7, 2)', expected: 7, desc: 'Fonction max' },
];

let passed = 0;
let failed = 0;

console.log('\n📊 Tests de calculs valides:\n');

for (const test of tests) {
    try {
        const result = evaluateExpression(test.expr);
        
        // Vérifier que le résultat est toujours un nombre
        if (typeof result !== 'number') {
            console.log(`❌ ${test.desc}: Type incorrect - ${typeof result} au lieu de number`);
            failed++;
            continue;
        }
        
        if (result === test.expected) {
            console.log(`✅ ${test.desc}: ${test.expr} = ${result}`);
            passed++;
        } else {
            console.log(`❌ ${test.desc}: ${test.expr} = ${result} (attendu: ${test.expected})`);
            failed++;
        }
    } catch (error) {
        console.log(`❌ ${test.desc}: Erreur - ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        failed++;
    }
}

console.log('\n🛡️  Tests de sécurité et validation:\n');

const errorTests = [
    { expr: '', desc: 'Expression vide', expectedMsg: 'Expression invalide' },
    { expr: '   ', desc: 'Seulement des espaces', expectedMsg: 'Expression invalide' },
    { expr: '2 + foo', desc: 'Variable inconnue', expectedMsg: 'Expression invalide' },
    { expr: 'f(x) = x^2', desc: 'Définition de fonction', expectedMsg: 'Expression invalide' },
    { expr: '[1, 2; 3, 4]', desc: 'Matrice', expectedMsg: 'Expression invalide' },
    { expr: 'sqrt(-1)', desc: 'Nombre complexe', expectedMsg: 'Expression invalide' },
];

for (const test of errorTests) {
    try {
        const result = evaluateExpression(test.expr);
        console.log(`❌ ${test.desc}: Devrait lever une erreur mais a retourné: ${result}`);
        failed++;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        if (message.includes(test.expectedMsg)) {
            console.log(`✅ ${test.desc}: Erreur standardisée correctement - "${message}"`);
            passed++;
        } else {
            console.log(`❌ ${test.desc}: Message d'erreur incorrect - "${message}"`);
            failed++;
        }
    }
}

console.log('\n🔍 Tests de normalisation des sorties:\n');

const outputTests = [
    { expr: '1/0', desc: 'Division par zéro', expected: Infinity },
    { expr: '0/0', desc: 'Résultat NaN', checkNaN: true },
];

for (const test of outputTests) {
    try {
        const result = evaluateExpression(test.expr);
        
        if (typeof result !== 'number') {
            console.log(`❌ ${test.desc}: Type incorrect - ${typeof result} au lieu de number`);
            failed++;
            continue;
        }
        
        if (test.checkNaN) {
            if (isNaN(result)) {
                console.log(`✅ ${test.desc}: Résultat NaN correctement retourné`);
                passed++;
            } else {
                console.log(`❌ ${test.desc}: Devrait retourner NaN mais a retourné ${result}`);
                failed++;
            }
        } else if (result === test.expected) {
            console.log(`✅ ${test.desc}: ${result} (type: ${typeof result})`);
            passed++;
        } else {
            console.log(`❌ ${test.desc}: ${result} (attendu: ${test.expected})`);
            failed++;
        }
    } catch (error) {
        console.log(`❌ ${test.desc}: Erreur inattendue - ${error instanceof Error ? error.message : 'Erreur'}`);
        failed++;
    }
}

console.log('\n' + '═'.repeat(60));
console.log(`📊 Résultats Finaux: ${passed} tests réussis, ${failed} tests échoués`);
console.log('═'.repeat(60));

if (failed === 0) {
    console.log('\n🎉 Tous les tests passent!');
    console.log('✅ Calculs de base fonctionnels');
    console.log('✅ Validation et erreurs standardisées');
    console.log('✅ Normalisation des sorties (toujours number)');
    console.log('✅ Sécurité (rejet matrices/complexes/fonctions)');
    process.exit(0);
} else {
    console.log('\n❌ Certains tests ont échoué');
    process.exit(1);
}
