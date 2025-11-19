// src/ui/observatory/OrionObservatory.tsx
import React from 'react';
import { ConstellationView } from './ConstellationView';
import { LogStreamView, LogEntry } from './LogStreamView';

interface OrionObservatoryProps {
    isOpen: boolean;
    onClose: () => void;
    workers: any[];
    leader: string | null;
    epoch: number;
    logs: LogEntry[];
    onKillWorker: (name: string) => void;
}

export function OrionObservatory({ isOpen, onClose, workers, leader, epoch, logs, onKillWorker }: OrionObservatoryProps) {
    if (!isOpen) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.panel}>
                <div style={styles.header}>
                    <h1 style={styles.title}>Orion Observatory</h1>
                    <button onClick={onClose} style={styles.closeButton}>&times;</button>
                </div>
                <div style={styles.content}>
                    <ConstellationView
                        workers={workers}
                        leader={leader}
                        epoch={epoch}
                        onKillWorker={onKillWorker}
                    />
                    <LogStreamView logs={logs} />
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
    },
    panel: {
        backgroundColor: '#111827',
        width: '90%',
        maxWidth: '1200px',
        height: '90%',
        borderRadius: '1rem',
        display: 'flex',
        flexDirection: 'column' as const,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
    },
    header: {
        padding: '1rem 2rem',
        borderBottom: '1px solid #374151',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1f2937'
    },
    title: {
        margin: 0,
        color: '#60a5fa',
        fontSize: '1.5rem'
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#9ca3af',
        fontSize: '2rem',
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1
    },
    content: {
        padding: '2rem',
        overflowY: 'auto' as const,
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '2rem'
    }
};
