// src/ui/observatory/OrionObservatory.tsx
import React, { useState } from 'react';
import { ConstellationView } from './ConstellationView';
import { LogStreamView, LogEntry } from './LogStreamView';
import { JournalCognitifView } from './JournalCognitifView';
import { FeedbackPanel } from './FeedbackPanel';
import { SerializedJournal } from '../../core/oie/JournalCognitif';

interface OrionObservatoryProps {
    isOpen: boolean;
    onClose: () => void;
    workers: any[];
    leader: string | null;
    epoch: number;
    logs: LogEntry[];
    onKillWorker: (name: string) => void;
    journal?: SerializedJournal | null;
}

export function OrionObservatory({ isOpen, onClose, workers, leader, epoch, logs, onKillWorker, journal }: OrionObservatoryProps) {
    const [activeTab, setActiveTab] = useState<'constellation' | 'logs' | 'journal' | 'feedback'>('journal');

    if (!isOpen) return null;

    const handleFeedback = (feedbackData: any) => {
        // Store feedback in localStorage for now
        const feedbackList = JSON.parse(localStorage.getItem('kensho_feedback') || '[]');
        feedbackList.push(feedbackData);
        localStorage.setItem('kensho_feedback', JSON.stringify(feedbackList));
        console.log('[Feedback]', feedbackData);
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.panel}>
                <div style={styles.header}>
                    <h1 style={styles.title}>Orion Observatory</h1>
                    <button onClick={onClose} style={styles.closeButton}>&times;</button>
                </div>
                
                <div style={styles.tabContainer}>
                    {(['journal', 'constellation', 'logs', 'feedback'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                ...styles.tabButton,
                                backgroundColor: activeTab === tab ? '#3b82f6' : '#374151'
                            }}
                        >
                            {tab === 'journal' && '📊 Journal'}
                            {tab === 'constellation' && '🌌 Constellation'}
                            {tab === 'logs' && '📝 Logs'}
                            {tab === 'feedback' && '💬 Feedback'}
                        </button>
                    ))}
                </div>

                <div style={styles.content}>
                    {activeTab === 'journal' && (
                        <JournalCognitifView journal={journal || null} />
                    )}
                    {activeTab === 'constellation' && (
                        <ConstellationView
                            workers={workers}
                            leader={leader}
                            epoch={epoch}
                            onKillWorker={onKillWorker}
                        />
                    )}
                    {activeTab === 'logs' && (
                        <LogStreamView logs={logs} />
                    )}
                    {activeTab === 'feedback' && journal && (
                        <FeedbackPanel
                            queryId={journal.queryId}
                            onFeedback={handleFeedback}
                        />
                    )}
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
    tabContainer: {
        display: 'flex' as const,
        gap: '0.5rem',
        padding: '0.5rem 2rem',
        backgroundColor: '#1f2937',
        borderBottom: '1px solid #374151',
        overflowX: 'auto' as const
    },
    tabButton: {
        padding: '0.75rem 1rem',
        border: 'none',
        borderRadius: '0.375rem',
        color: '#d1d5db',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const,
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        whiteSpace: 'nowrap' as const
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
