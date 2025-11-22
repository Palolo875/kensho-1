/**
 * Une classe utilitaire robuste pour extraire un objet JSON valide
 * à partir d'une chaîne de texte potentiellement bruitée générée par un LLM.
 * 
 * Philosophie : "Ne jamais faire confiance à un LLM."
 * Cette classe part du principe que la sortie du LLM sera bruitée, 
 * mal formatée et non fiable, et construit une coquille de robustesse 
 * pour en extraire de la valeur de manière déterministe.
 */
export class JSONExtractor {
    /**
     * Extrait le premier objet JSON valide d'une chaîne de texte.
     * Gère le texte avant/après le JSON, les blocs de code Markdown, et les commentaires.
     * 
     * @param text - La chaîne de texte contenant potentiellement du JSON
     * @returns L'objet JSON parsé, ou null si aucun JSON valide n'est trouvé
     */
    public static extract(text: string): any | null {
        // Étape 1: Extraire le contenu d'un bloc de code JSON Markdown, si présent.
        let content = this.extractFromMarkdown(text);

        // Étape 2: Trouver le premier '{' et le dernier '}' pour délimiter le JSON potentiel.
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1) {
            return null; // Pas de JSON trouvé
        }
        
        content = content.substring(firstBrace, lastBrace + 1);
        
        // Étape 3: Nettoyer les commentaires et les virgules finales.
        content = this.cleanupJSONString(content);
        
        // Étape 4: Tenter de parser.
        try {
            return JSON.parse(content);
        } catch (error) {
            console.warn('[JSONExtractor] Le parsing JSON a échoué après le nettoyage.', error);
            // En cas d'échec, on ne tente pas de fallback pour éviter les faux positifs.
            // La robustesse doit venir du nettoyage, pas de tentatives hasardeuses.
            return null;
        }
    }

    /**
     * Extrait le contenu d'un bloc de code Markdown formaté en JSON.
     * Si aucun bloc n'est trouvé, retourne le texte original.
     * 
     * @param text - Le texte potentiellement contenant un bloc Markdown
     * @returns Le contenu du bloc JSON ou le texte original
     */
    private static extractFromMarkdown(text: string): string {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        return match ? match[1] : text;
    }

    /**
     * Nettoie une chaîne JSON en supprimant les commentaires et les virgules finales.
     * Utilise une machine à états pour respecter les limites des chaînes de caractères.
     * 
     * @param jsonString - La chaîne JSON à nettoyer
     * @returns La chaîne JSON nettoyée
     */
    private static cleanupJSONString(jsonString: string): string {
        let result = '';
        let inString = false;
        let escaped = false;
        let i = 0;

        // Étape 1: Supprimer les commentaires en respectant les chaînes de caractères
        while (i < jsonString.length) {
            const char = jsonString[i];
            const nextChar = jsonString[i + 1];

            // Gérer l'échappement dans les chaînes
            if (inString && escaped) {
                result += char;
                escaped = false;
                i++;
                continue;
            }

            // Détecter le caractère d'échappement
            if (inString && char === '\\') {
                result += char;
                escaped = true;
                i++;
                continue;
            }

            // Basculer l'état de chaîne de caractères
            if (char === '"') {
                inString = !inString;
                result += char;
                i++;
                continue;
            }

            // Si on est dans une chaîne, copier tel quel
            if (inString) {
                result += char;
                i++;
                continue;
            }

            // Hors d'une chaîne : détecter et supprimer les commentaires
            // Commentaire de ligne : //
            if (char === '/' && nextChar === '/') {
                // Sauter jusqu'à la fin de la ligne
                i += 2;
                while (i < jsonString.length && jsonString[i] !== '\n') {
                    i++;
                }
                continue;
            }

            // Commentaire de bloc : /* ... */
            if (char === '/' && nextChar === '*') {
                // Sauter jusqu'à la fin du bloc
                i += 2;
                while (i < jsonString.length - 1) {
                    if (jsonString[i] === '*' && jsonString[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
                continue;
            }

            // Sinon, copier le caractère
            result += char;
            i++;
        }

        // Étape 2: Supprimer les virgules finales dans les objets et les tableaux
        result = result.replace(/,\s*([}\]])/g, '$1');

        return result;
    }
}
