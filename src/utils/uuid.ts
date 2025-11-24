/**
 * Utilitaire centralisé pour la génération d'UUID avec polyfill.
 * Gère les environnements où crypto.randomUUID() n'est pas disponible.
 */

/**
 * Vérifie si crypto.randomUUID() est disponible
 */
function hasNativeUUID(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
}

/**
 * Polyfill pour crypto.randomUUID() basé sur la spec RFC 4122 (UUID v4).
 * Utilisé quand crypto.randomUUID() n'est pas disponible (par exemple, dans certains environnements Node.js).
 */
function polyfillUUID(): string {
  // Format UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // où x est un chiffre hexadécimal aléatoire et y est l'un de 8, 9, A ou B
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Génère un UUID v4.
 * Utilise crypto.randomUUID() si disponible, sinon utilise le polyfill.
 * 
 * @returns Un UUID v4 conforme à RFC 4122
 * @example
 * const id = generateUUID(); // "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateUUID(): string {
  if (hasNativeUUID()) {
    return crypto.randomUUID();
  }
  return polyfillUUID();
}

/**
 * Valide qu'une chaîne est un UUID v4 valide.
 * 
 * @param uuid - La chaîne à valider
 * @returns true si c'est un UUID v4 valide, false sinon
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
