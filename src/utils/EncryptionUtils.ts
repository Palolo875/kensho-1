/**
 * Utilitaires de chiffrement AES-GCM pour l'export de mémoire.
 * Utilise l'API SubtleCrypto du navigateur pour un chiffrement sécurisé.
 */

export class EncryptionUtils {
  /**
   * Chiffre des données brutes avec AES-GCM via un mot de passe.
   */
  static async encryptData(data: Uint8Array, password: string): Promise<Uint8Array> {
    // Dériver une clé à partir du mot de passe avec PBKDF2
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Créer une clé de base pour PBKDF2
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Dériver une clé de 256 bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(16), // Salt simple pour la démo
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    const key = await crypto.subtle.importKey(
      'raw',
      derivedBits,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Générer un IV aléatoire
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Chiffrer les données
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combiner IV + ciphertext
    const ciphertextArray = new Uint8Array(ciphertext as ArrayBuffer);
    const result = new Uint8Array(iv.length + ciphertextArray.byteLength);
    result.set(iv, 0);
    result.set(ciphertextArray, iv.length);

    return result;
  }

  /**
   * Déchiffre des données chiffrées avec AES-GCM.
   */
  static async decryptData(encryptedData: Uint8Array, password: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(16),
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    const key = await crypto.subtle.importKey(
      'raw',
      derivedBits,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Extraire IV et ciphertext
    const iv = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new Uint8Array(plaintext);
  }

  /**
   * Exporte et chiffre la base de données SQLite.
   */
  static async exportEncryptedDatabase(dbData: Uint8Array, password: string): Promise<Blob> {
    const encrypted = await this.encryptData(dbData, password);
    return new Blob([encrypted.buffer as BlobPart], { type: 'application/octet-stream' });
  }

  /**
   * Déclenche le téléchargement d'un blob.
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
