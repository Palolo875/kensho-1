// src/ui/observatory/ConstellationView.tsx
import React from 'react';

interface WorkerStatus {
    name: string;
    isLeader: boolean;
    active: boolean;
}

interface ConstellationViewProps {
    workers: WorkerStatus[];
    leader: string | null;
    epoch: number;
    onKillWorker: (name: string) => void;
}

export function ConstellationView({ workers, leader, epoch, onKillWorker }: ConstellationViewProps) {
    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Constellation Status (Epoch: {epoch})</h2>
            <div style={styles.workerGrid}>
                {workers.map(worker => (
                    <div key={worker.name} style={{
                        ...styles.workerCard,
                        borderColor: worker.name === leader ? '#fbbf24' : '#4b5563',
                        boxShadow: worker.name === leader ? '0 0 10px rgba(251, 191, 36, 0.3)' : 'none'
                    }}>
                        <div style={styles.workerHeader}>
                            <span style={styles.icon}>{worker.name === leader ? '👑' : '⚙️'}</span>
                            <span style={styles.name}>{worker.name}</span>
                        </div>
                        <div style={styles.status}>
                            Status: <span style={{ color: worker.active ? '#34d399' : '#ef4444' }}>{worker.active ? 'Active' : 'Dead'}</span>
                        </div>
                        <button
                            onClick={() => onKillWorker(worker.name)}
                            style={styles.killButton}
                            disabled={!worker.active}
                        >
                            Kill
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    container: {
        padding: '1rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        color: '#f3f4f6'
    },
    title: {
        marginTop: 0,
        borderBottom: '1px solid #374151',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
    },
    workerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem'
    },
    workerCard: {
        backgroundColor: '#111827',
        padding: '1rem',
        borderRadius: '0.5rem',
        border: '1px solid #4b5563',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.5rem'
    },
    workerHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontWeight: 'bold' as const,
        fontSize: '1.1rem'
    },
    icon: {
        fontSize: '1.5rem'
    },
    name: {
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },
    status: {
        fontSize: '0.9rem',
        color: '#9ca3af'
    },
    killButton: {
        marginTop: 'auto',
        padding: '0.5rem',
        backgroundColor: '#ef4444',
        color: 'white',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer',
        fontWeight: 'bold' as const,
        transition: 'background-color 0.2s'
    }
};
