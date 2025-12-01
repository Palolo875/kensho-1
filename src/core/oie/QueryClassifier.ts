// src/core/oie/QueryClassifier.ts
import { createLogger } from '@/lib/logger';

const log = createLogger('QueryClassifier');

/**
 * QueryClassifier : Le "trieur" à l'entrée du cerveau
 * 
 * Philosophie : "Ne pas sur-réfléchir."
 * Le débat est un outil puissant mais coûteux. Nous ne l'utiliserons que 
 * lorsque c'est nécessaire.
 * 
 * Ce classifieur est rapide (pas de LLM) et nuancé (pas binaire).
 * Le système de poids permet d'affiner facilement le comportement.
 */

// Système de poids pour une classification nuancée
const COMPLEXITY_WEIGHTS: { [key: string]: number } = {
    // Mots-clés à forte probabilité de complexité
    'devrais': 0.9, 'devrait': 0.9, 'recommandes': 0.8, 'conseilles': 0.8,
    'avantages': 0.7, 'inconvénients': 0.7, 'risques': 0.7, 'opportunités': 0.7,
    'meilleure option': 0.8, 'comparer': 0.6, 'évaluer': 0.6, 'analyser': 0.6,
    'stratégie': 0.8, 'choisir': 0.7, 'décision': 0.8, 'opinion': 0.6,
    
    // Mots-clés ambigus
    'pourquoi': 0.3, 'comment': 0.2, 'explique': 0.4,
    
    // Mots-clés à faible probabilité de complexité
    'qui': -0.5, 'quoi': -0.5, 'où': -0.5, 'quand': -0.5, 'combien': -0.5,
    'quelle est': -0.7, 'quel est': -0.7, 'définition': -0.8, 'capitale': -0.9,
};

const COMPLEXITY_THRESHOLD = 0.5; // Seuil pour déclencher un débat

export class QueryClassifier {
    /**
     * Normalise une chaîne pour la comparaison (retire les accents, lowercase)
     */
    private normalizeString(str: string): string {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    /**
     * Classifie une requête utilisateur en 'simple' ou 'complex'
     * 
     * @param query - La requête de l'utilisateur
     * @returns 'simple' ou 'complex'
     */
    public classify(query: string): 'simple' | 'complex' {
        const normalizedQuery = this.normalizeString(query);
        let score = 0;

        // Parcourir tous les mots-clés et additionner leurs poids
        for (const [keyword, weight] of Object.entries(COMPLEXITY_WEIGHTS)) {
            const normalizedKeyword = this.normalizeString(keyword);
            if (normalizedQuery.includes(normalizedKeyword)) {
                score += weight;
            }
        }

        // Heuristique de longueur : les questions très longues sont probablement complexes
        const wordCount = query.split(/\s+/).length;
        if (wordCount > 20) {
            score += 0.2;
        }

        log.debug(`Score de complexité pour la requête: ${score.toFixed(2)} (seuil: ${COMPLEXITY_THRESHOLD})`);

        return score >= COMPLEXITY_THRESHOLD ? 'complex' : 'simple';
    }
}
