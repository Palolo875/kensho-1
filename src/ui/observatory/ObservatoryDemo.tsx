// src/ui/observatory/ObservatoryDemo.tsx
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { OrionObservatory } from './OrionObservatory';
import { MessageBus } from '../../core/communication/MessageBus';

// Types pour l'état
interface WorkerState {
    name: string;
    isLeader: boolean;
    active: boolean;
    workerInstance?: Worker;
}

const AGENT_FILES = ['ping.agent.js', 'pong.agent.js', 'telemetry.agent.js'];
const AGENT_NAMES = ['AgentA', 'AgentB', 'AgentC', 'TelemetryWorker'];

function App() {
    const [isOpen, setIsOpen] = useState(true);
    const [workers, setWorkers] = useState<WorkerState[]>([]);
    const [leader, setLeader] = useState<string | null>(null);
    const [epoch, setEpoch] = useState(0);
    const [logs, setLogs] = useState<any[]>([]);
    const [journal, setJournal] = useState<any>(null);

    const mainBusRef = useRef<MessageBus | null>(null);
    const workersRef = useRef<{ [key: string]: Worker }>({});

    useEffect(() => {
        // Initialisation
        const bus = new MessageBus('MainThread');
        mainBusRef.current = bus;

        // Démarrer les workers
        const startWorkers = async () => {
            const newWorkers: WorkerState[] = [];

            // Démarrer TelemetryWorker
            const telemetryWorker = new Worker('/dist/test-agents/telemetry.agent.js', { type: 'module', name: 'TelemetryWorker' });
            telemetryWorker.onmessage = (e) => {
                if (e.data.type === 'LOG_BATCH') {
                    setLogs(prev => [...prev, ...e.data.payload].slice(-100)); // Garder les 100 derniers
                }
            };
            workersRef.current['TelemetryWorker'] = telemetryWorker;

            // Démarrer les Agents (A, B, C)
            for (const name of ['AgentA', 'AgentB', 'AgentC']) {
                const worker = new Worker('/dist/test-agents/ping.agent.js', { type: 'module', name });
                workersRef.current[name] = worker;
                newWorkers.push({ name, isLeader: false, active: true });
            }

            setWorkers(newWorkers);
        };

        startWorkers();

        // Boucle de mise à jour du statut
        const interval = setInterval(async () => {
            if (!mainBusRef.current) return;

            const currentWorkerNames = Object.keys(workersRef.current).filter(n => n !== 'TelemetryWorker');

            try {
                const statuses = await Promise.allSettled(
                    currentWorkerNames.map(name =>
                        mainBusRef.current!.request(name, { method: 'getGuardianStatus', args: [] }, 500)
                    )
                );

                let currentLeader = null;
                let currentEpoch = 0;
                const updatedWorkers: WorkerState[] = [];

                currentWorkerNames.forEach((name, index) => {
                    const result = statuses[index];
                    if (result.status === 'fulfilled') {
                        const status = result.value as { isLeader: boolean; epoch: number };
                        if (status.isLeader) {
                            currentLeader = name;
                            currentEpoch = status.epoch;
                        }
                        updatedWorkers.push({ name, isLeader: status.isLeader, active: true });
                    } else {
                        updatedWorkers.push({ name, isLeader: false, active: false });
                    }
                });

                setWorkers(updatedWorkers);
                setLeader(currentLeader);
                setEpoch(currentEpoch);

            } catch (e) {
                console.error("Erreur lors de la mise à jour du statut", e);
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            bus.dispose();
            Object.values(workersRef.current).forEach(w => w.terminate());
        };
    }, []);

    const handleKillWorker = (name: string) => {
        const worker = workersRef.current[name];
        if (worker) {
            worker.terminate();
            delete workersRef.current[name];
            // Mettre à jour l'état immédiatement pour refléter la mort
            setWorkers(prev => prev.map(w => w.name === name ? { ...w, active: false } : w));

            // Ajouter un log système
            setLogs(prev => [...prev, {
                timestamp: Date.now(),
                agent: 'SYSTEM',
                level: 'warn',
                message: `Worker ${name} tué manuellement.`
            }]);
        }
    };

    return (
        <div>
            <button
                onClick={() => setIsOpen(true)}
                style={{ padding: '1rem', fontSize: '1.2rem', margin: '2rem' }}
            >
                Ouvrir l'Observatoire
            </button>
            <OrionObservatory
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                workers={workers}
                leader={leader}
                epoch={epoch}
                logs={logs}
                onKillWorker={handleKillWorker}
                journal={journal}
            />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
