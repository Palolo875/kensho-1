# 🧪 Guide de Validation Manuelle : Sprint 2 - Streaming

Ce guide vous permet de valider que la fonctionnalité de Streaming fonctionne correctement dans votre navigateur.

## 📋 Prérequis
- Le serveur de développement doit être lancé :
  ```bash
  npm run dev
  ```
  (Vérifiez qu'il est accessible sur `http://localhost:8080` ou le port indiqué).

---

## 🚀 Procédure de Test

1.  **Ouvrir le Test E2E**
    Naviguez vers l'URL suivante dans votre navigateur :
    `http://localhost:8080/tests/browser/sprint2-streaming-e2e.html`

2.  **Lancer le Test**
    Cliquez sur le bouton bleu **"🚀 Lancer le Test de Streaming"**.

3.  **Observer les Logs**
    Vous devriez voir une séquence d'événements similaire à celle-ci :
    - `[INFO] Initialisation du test...`
    - `[SUCCESS] StreamerAgent prêt.`
    - `[SUCCESS] ConsumerAgent prêt.`
    - `[INFO] Consumer demande le stream "generateNumbers"...`
    - `[INFO] [Streamer] Reçu demande de stream...`
    - `[INFO] [Streamer] Envoi chunk 1/5`
    - `[INFO] [Consumer] Reçu chunk: {"value":1...}`
    - ... (répété pour 2, 3, 4, 5)
    - `[INFO] [Streamer] Fin du stream`
    - `[SUCCESS] [Consumer] Stream terminé.`

4.  **Vérifier le Résultat Final**
    - Une boîte verte doit apparaître avec le message :
      **"🎉 TEST RÉUSSI ! Le streaming fonctionne correctement."**

---

## ❓ Dépannage

### Le test reste bloqué ou échoue
- **Vérifiez la console du navigateur (F12)** : Y a-t-il des erreurs JavaScript rouges ?
- **Timeout** : Si rien ne se passe après 5 secondes, c'est qu'un message a été perdu (problème de transport).
- **Erreur "Method not found"** : L'enregistrement de la méthode de stream a échoué.

### Le build a échoué avant ?
Si vous avez vu des erreurs de build `esbuild`, essayez de relancer `npm run dev`. Vite utilise esbuild à la volée, donc si le serveur tourne, le test devrait fonctionner.
