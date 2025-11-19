// src/ui/observatory/LogStreamView.tsx
import React, { useEffect, useRef } from 'react';

export interface LogEntry {
    timestamp: number;
    agent: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}

interface LogStreamViewProps {
    logs: LogEntry[];
}

export function LogStreamView({ logs }: LogStreamViewProps) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Log Stream</h2>
            <div style={styles.logArea}>
                {logs.map((log, index) => (
                    <div key={`${log.timestamp}-${index}`} style={{
                        ...styles.logEntry,
                        borderLeftColor: getLevelColor(log.level)
                    }}>
                        <span style={styles.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span style={{ ...styles.agent, color: getLevelColor(log.level) }}>[{log.agent}]</span>
                        <span style={styles.message}>{log.message}</span>
                        {log.data && (
                            <pre style={styles.data}>{JSON.stringify(log.data, null, 2)}</pre>
                        )}
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
}

function getLevelColor(level: string) {
    switch (level) {
        case 'error': return '#ef4444';
        case 'warn': return '#f59e0b';
        default: return '#60a5fa';
    }
}

const styles = {
    container: {
        padding: '1rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.5rem',
        color: '#f3f4f6',
        height: '400px',
        display: 'flex',
        flexDirection: 'column' as const
    },
    title: {
        marginTop: 0,
        borderBottom: '1px solid #374151',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
    },
    logArea: {
        flex: 1,
        overflowY: 'auto' as const,
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        backgroundColor: '#111827',
        padding: '0.5rem',
        borderRadius: '0.25rem'
    },
    logEntry: {
        marginBottom: '0.5rem',
        paddingLeft: '0.5rem',
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid'
    },
    timestamp: {
        color: '#6b7280',
        marginRight: '0.5rem'
    },
    agent: {
        fontWeight: 'bold' as const,
        marginRight: '0.5rem'
    },
    message: {
        color: '#e5e7eb'
    },
    data: {
        margin: '0.25rem 0 0 0',
        fontSize: '0.8rem',
        color: '#9ca3af'
    }
};
