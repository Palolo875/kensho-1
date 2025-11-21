export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',     // Nouvelle fonctionnalité
                'fix',      // Correction de bug
                'docs',     // Documentation seulement
                'style',    // Formatage, point-virgules manquants, etc.
                'refactor', // Refactoring sans changement de fonctionnalité
                'perf',     // Amélioration de performance
                'test',     // Ajout ou modification de tests
                'chore',    // Tâches de maintenance
                'ci',       // Changements CI/CD
                'build',    // Changements au système de build
                'revert',   // Revert d'un commit précédent
            ],
        ],
        'subject-case': [0], // Allow any case for subject
    },
};
