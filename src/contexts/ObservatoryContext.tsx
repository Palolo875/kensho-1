// src/contexts/ObservatoryContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { MessageBus } from '@/core/communication/MessageBus';

export interface WorkerStatus {
    name: string;
    isLeader: boolean;
    active: boolean;
}

export interface LogEntry {
    timestamp: number;
    agent: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}

export interface SerializedJournal {
    type: 'debate' | 'simple';
    queryId: string;
    userQuery: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    steps: any[];
    finalResponse?: string;
    degradationApplied?: boolean;
    degradationReason?: string;
}

interface ObservatoryContextType {
    workers: WorkerStatus[];
    leader: string | null;
    epoch: number;
    logs: LogEntry[];
    journal: SerializedJournal | null;
    isEnabled: boolean;
    startObservatory: () => void;
    stopObservatory: () => void;
    killWorker: (name: string) => void;
    setJournal: (journal: SerializedJournal | null) => void;
}

const ObservatoryContext = createContext<ObservatoryContextType | null>(null);

export function useObservatory() {
    const context = useContext(ObservatoryContext);
    if (!context) {
        throw new Error('useObservatory must be used within ObservatoryProvider');
    }
    return context;
}

interface ObservatoryProviderProps {
    children: ReactNode;
}

export function ObservatoryProvider({ children }: ObservatoryProviderProps) {
    const [workers, setWorkers] = useState<WorkerStatus[]>([]);
    const [leader, setLeader] = useState<string | null>(null);
    const [epoch, setEpoch] = useState(0);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [journal, setJournal] = useState<SerializedJournal | null>(null);
    const [isEnabled, setIsEnabled] = useState(false);

    const mainBusRef = useRef<MessageBus | null>(null);
    const workersRef = useRef<{ [key: string]: Worker }>({});
    const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const startObservatory = () => {
        if (isEnabled) return;

        console.log('[Observatory] Starting...');

        // Initialisation du bus principal
        const bus = new MessageBus('MainThread');
        mainBusRef.current = bus;

        // Démarrer TelemetryWorker
        try {
            const telemetryWorker = new Worker('/dist/test-agents/telemetry.agent.js', {
                type: 'module',
                name: 'TelemetryWorker'
            });

            telemetryWorker.onmessage = (e) => {
                if (e.data.type === 'LOG_BATCH') {
                    setLogs(prev => [...prev, ...e.data.payload].slice(-100));
                }
            };

            workersRef.current['TelemetryWorker'] = telemetryWorker;
        } catch (error) {
            console.error('[Observatory] Failed to start TelemetryWorker:', error);
        }

        // Démarrer les agents de test
        const agentNames = ['AgentA', 'AgentB', 'AgentC'];
        const newWorkers: WorkerStatus[] = [];

        agentNames.forEach(name => {
            try {
                const worker = new Worker('/dist/test-agents/ping.agent.js', {
                    type: 'module',
                    name
                });
                workersRef.current[name] = worker;
                newWorkers.push({ name, isLeader: false, active: true });
            } catch (error) {
                console.error(`[Observatory] Failed to start ${name}:`, error);
            }
        });

        setWorkers(newWorkers);

        // Boucle de mise à jour du statut
        updateIntervalRef.current = setInterval(async () => {
            if (!mainBusRef.current) return;

            const currentWorkerNames = Object.keys(workersRef.current).filter(
                n => n !== 'TelemetryWorker'
            );

            try {
                const statuses = await Promise.allSettled(
                    currentWorkerNames.map(name =>
                        mainBusRef.current!.request(
                            name,
                            { method: 'getGuardianStatus', args: [] },
                            500
                        )
                    )
                );

                let currentLeader = null;
                let currentEpoch = 0;
                const updatedWorkers: WorkerStatus[] = [];

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
                console.error('[Observatory] Error updating status:', e);
            }
        }, 1000);

        setIsEnabled(true);
    };

    const stopObservatory = () => {
        console.log('[Observatory] Stopping...');

        if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
        }

        if (mainBusRef.current) {
            mainBusRef.current.dispose();
            mainBusRef.current = null;
        }

        Object.values(workersRef.current).forEach(w => w.terminate());
        workersRef.current = {};

        setWorkers([]);
        setLeader(null);
        setEpoch(0);
        setLogs([]);
        setIsEnabled(false);
    };

    const killWorker = (name: string) => {
        const worker = workersRef.current[name];
        if (worker) {
            worker.terminate();
            delete workersRef.current[name];

            setWorkers(prev =>
                prev.map(w => (w.name === name ? { ...w, active: false } : w))
            );

            setLogs(prev => [
                ...prev,
                {
                    timestamp: Date.now(),
                    agent: 'SYSTEM',
                    level: 'warn',
                    message: `Worker ${name} terminated manually.`
                }
            ]);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isEnabled) {
                stopObservatory();
            }
        };
    }, [isEnabled]);

    return (
        <ObservatoryContext.Provider
            value={{
                workers,
                leader,
                epoch,
                logs,
                journal,
                isEnabled,
                startObservatory,
                stopObservatory,
                killWorker,
                setJournal
            }}
        >
            {children}
        </ObservatoryContext.Provider>
    );
}
