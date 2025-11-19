// Exemple d'utilisation complète du système de transport Kensho
// Ce fichier montre comment créer des agents avec différents transports

import { runAgent } from './core/agent-system/defineAgent';

// ============================================
// EXEMPLE 1 : Agent Local (BroadcastChannel)
// ============================================
// Cas d'usage : Communication rapide dans la même application
// (même origine, même domaine)

export function createLocalAgent() {
    return runAgent({
        name: 'LocalAgent',
        // Pas de config = BroadcastChannel par défaut
        init: (runtime) => {
            runtime.registerMethod('processData', async (args) => {
                const data = args[0];
                return { processed: true, data };
            });

            // Exemple d'appel à un autre agent local
            runtime.registerMethod('callPeer', async (args) => {
                try {
                    const result = await runtime.callAgent(
                        'PeerAgent',
                        'someMethod',
                        args
                    );
                    return result;
                } catch (error) {
                    console.error('Failed to call peer:', error);
                    throw error;
                }
            });
        }
    });
}

// ============================================
// EXEMPLE 2 : Agent Distant (WebSocket)
// ============================================
// Cas d'usage : Communication entre différents navigateurs,
// onglets sur différents appareils, ou environnements distribués

export function createRemoteAgent() {
    return runAgent({
        name: 'RemoteAgent',
        config: {
            useWebSocket: true // Active le transport WebSocket
        },
        init: (runtime) => {
            console.log(`[${runtime.agentName}] Connecté au serveur WebSocket`);

            runtime.registerMethod('remoteTask', async (args) => {
                const taskData = args[0];
                console.log('Processing remote task:', taskData);

                // Simuler un traitement
                await new Promise(resolve => setTimeout(resolve, 100));

                return {
                    success: true,
                    taskId: taskData.id,
                    processedAt: Date.now()
                };
            });

            // Appeler un agent distant
            runtime.registerMethod('coordinateWithRemote', async (args) => {
                const targetAgent = args[0];
                const payload = args[1];

                const result = await runtime.callAgent(
                    targetAgent,
                    'remoteTask',
                    [payload],
                    10000 // timeout de 10 secondes
                );

                return result;
            });
        }
    });
}

// ============================================
// EXEMPLE 3 : Agent Hybride (RECOMMANDÉ)
// ============================================
// Cas d'usage : Application qui doit fonctionner à la fois
// localement (rapide) et à distance (distribué)

export function createHybridAgent() {
    return runAgent({
        name: 'HybridAgent',
        config: {
            useHybrid: true // Utilise BroadcastChannel + WebSocket
        },
        init: (runtime) => {
            console.log(`[${runtime.agentName}] Mode hybride activé`);

            // Cette méthode peut être appelée localement OU à distance
            runtime.registerMethod('universalMethod', async (args) => {
                return {
                    message: 'Je fonctionne partout !',
                    agent: runtime.agentName,
                    args
                };
            });

            // Orchestration multi-agents
            runtime.registerMethod('orchestrate', async (args) => {
                const agents = ['Agent1', 'Agent2', 'Agent3'];
                const results = await Promise.all(
                    agents.map(agent =>
                        runtime.callAgent(agent, 'universalMethod', [{ from: runtime.agentName }])
                            .catch(err => ({ error: err.message, agent }))
                    )
                );
                return { results };
            });

            // Accès au statut du Guardian (système de résilience)
            runtime.registerMethod('getStatus', async () => {
                return runtime.getGuardianStatus();
            });
        }
    });
}

// ============================================
// EXEMPLE 4 : Pattern Requête/Réponse
// ============================================

export function createRequestResponseExample() {
    return runAgent({
        name: 'ResponderAgent',
        config: { useHybrid: true },
        init: (runtime) => {
            // Enregistrer plusieurs méthodes
            runtime.registerMethod('add', async (args) => {
                const [a, b] = args;
                return a + b;
            });

            runtime.registerMethod('multiply', async (args) => {
                const [a, b] = args;
                return a * b;
            });

            runtime.registerMethod('complexOperation', async (args) => {
                const { operation, values } = args[0];

                switch (operation) {
                    case 'sum':
                        return values.reduce((a, b) => a + b, 0);
                    case 'product':
                        return values.reduce((a, b) => a * b, 1);
                    case 'average':
                        return values.reduce((a, b) => a + b, 0) / values.length;
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
            });
        }
    });
}

// ============================================
// EXEMPLE 5 : Gestion d'Erreurs
// ============================================

export function createErrorHandlingExample() {
    return runAgent({
        name: 'ErrorHandlerAgent',
        config: { useHybrid: true },
        init: (runtime) => {
            runtime.registerMethod('mightFail', async (args) => {
                const shouldFail = args[0];

                if (shouldFail) {
                    throw new Error('Intentional failure for demo');
                }

                return { success: true };
            });

            runtime.registerMethod('callUnsafe', async (args) => {
                try {
                    const result = await runtime.callAgent(
                        'OtherAgent',
                        'mightFail',
                        [true]
                    );
                    return { success: true, result };
                } catch (error) {
                    // L'erreur est automatiquement sérialisée et désérialisée
                    return {
                        success: false,
                        error: {
                            message: error.message,
                            name: error.name
                        }
                    };
                }
            });
        }
    });
}

// ============================================
// NOTES D'UTILISATION
// ============================================

/*
Pour utiliser ces agents dans votre application :

1. Dans le Main Thread :
   -----------------------
   const worker = new Worker('path/to/agent.js', {
       type: 'module',
       name: 'MonAgent'
   });

2. Dans un Worker :
   ------------------
   Copiez la définition de l'agent dans src/agents/mon-agent/index.ts
   et buildez avec : npm run build:remote-agents

3. Configuration du serveur relais (pour WebSocket) :
   ---------------------------------------------------
   - Démarrez le serveur : npm run relay
   - Le serveur écoute par défaut sur ws://localhost:8080
   - Pour changer : éditez server/relay.js

4. Debugging :
   -----------
   - Utilisez getGuardianStatus() pour voir l'état du système
   - Les logs console incluent l'origine de chaque message
   - Le MessageBus valide automatiquement les messages

5. Performance :
   -------------
   - BroadcastChannel : <1ms de latence
   - WebSocket local : ~5-10ms de latence
   - WebSocket réseau : dépend de la connexion
   - HybridTransport : combine les deux avec déduplication

6. Limites :
   ---------
   - BroadcastChannel : même origine uniquement
   - WebSocket : nécessite un serveur relais
   - Messages limités à ~256KB (selon le navigateur)
   - Sérialisation JSON uniquement (pas de fonctions, etc.)
*/
