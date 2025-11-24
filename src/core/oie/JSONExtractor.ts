export interface JSONExtractorOptions {
    /** 
     * Niveau de strictness pour l'extraction.
     * - 'strict': Rejette les JSON malformés ou ambigus
     * - 'lenient': Tente des conversions et corrections (guillemets simples, etc.)
     * @default 'lenient'
     */
    strictness?: 'strict' | 'lenient';
    
    /**
     * Tente de convertir les guillemets simples en doubles si le parsing échoue.
     * Uniquement utilisé en mode 'lenient'.
     * @default true
     */
    convertSingleQuotes?: boolean;
}

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
     * @param options - Options de configuration pour l'extraction
     * @returns L'objet JSON parsé, ou null si aucun JSON valide n'est trouvé
     */
    public static extract(text: string, options: JSONExtractorOptions = {}): any | null {
        const { strictness = 'lenient', convertSingleQuotes = true } = options;
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
            // En mode lenient, tenter des corrections supplémentaires
            if (strictness === 'lenient' && convertSingleQuotes) {
                try {
                    // Tenter de convertir les guillemets simples en doubles
                    const fixedContent = this.convertSingleQuotesToDouble(content);
                    return JSON.parse(fixedContent);
                } catch (secondError) {
                    console.warn('[JSONExtractor] Le parsing JSON a échoué même après conversion des guillemets.', secondError);
                }
            }
            
            console.warn('[JSONExtractor] Le parsing JSON a échoué après le nettoyage.', error);
            // En cas d'échec, on ne tente pas plus de fallback pour éviter les faux positifs.
            return null;
        }
    }

    /**
     * Extrait le contenu d'un bloc de code Markdown formaté en JSON.
     * Supporte plusieurs variations: ```json, ```JSON, ```Json, avec ou sans espace.
     * Si aucun bloc n'est trouvé, retourne le texte original.
     * 
     * @param text - Le texte potentiellement contenant un bloc Markdown
     * @returns Le contenu du bloc JSON ou le texte original
     */
    private static extractFromMarkdown(text: string): string {
        // Support de plusieurs variations de Markdown:
        // - ```json (standard)
        // - ```JSON (majuscules)
        // - ```Json (capitalisé)
        // - Avec ou sans espace après les backticks
        const patterns = [
            /```json\s*([\s\S]*?)\s*```/i,  // Case-insensitive pour json/JSON/Json
            /```\s*json\s*([\s\S]*?)\s*```/i, // Avec espace optionnel après ```
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return text;
    }
    
    /**
     * Convertit les guillemets simples en guillemets doubles de manière sécurisée.
     * Attention: cette conversion n'est pas parfaite et peut échouer sur des chaînes complexes.
     * Utilisé uniquement en mode lenient comme dernier recours.
     * 
     * @param jsonString - La chaîne JSON avec potentiellement des guillemets simples
     * @returns La chaîne avec les guillemets simples convertis en doubles
     */
    private static convertSingleQuotesToDouble(jsonString: string): string {
        let result = '';
        let i = 0;
        let inDoubleQuote = false;
        let escaped = false;
        
        while (i < jsonString.length) {
            const char = jsonString[i];
            
            // Gérer l'échappement
            if (escaped) {
                result += char;
                escaped = false;
                i++;
                continue;
            }
            
            // Détecter le caractère d'échappement
            if (char === '\\') {
                result += char;
                escaped = true;
                i++;
                continue;
            }
            
            // Tracker si on est dans une chaîne avec guillemets doubles
            if (char === '"') {
                inDoubleQuote = !inDoubleQuote;
                result += char;
                i++;
                continue;
            }
            
            // Convertir guillemets simples en doubles si on n'est pas déjà dans une chaîne
            if (char === "'" && !inDoubleQuote) {
                result += '"';
                i++;
                continue;
            }
            
            result += char;
            i++;
        }
        
        return result;
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
