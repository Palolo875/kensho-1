// src/ui/observatory/JournalCognitifView.tsx
import React from 'react';
import { SerializedJournal, JournalStep } from '../../core/oie/JournalCognitif';

interface JournalCognitifViewProps {
    journal: SerializedJournal | null;
}

export function JournalCognitifView({ journal }: JournalCognitifViewProps) {
    if (!journal) {
        return (
            <div style={styles.emptyState}>
                <p style={styles.emptyText}>En attente d'une réponse...</p>
            </div>
        );
    }

    const getStepStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return '#10b981';
            case 'failed':
                return '#ef4444';
            case 'running':
                return '#f59e0b';
            default:
                return '#6b7280';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return '✓';
            case 'failed':
                return '✗';
            case 'running':
                return '⟳';
            default:
                return '○';
        }
    };

    const formatTime = (ms: number) => {
        if (ms < 1000) return `${ms.toFixed(0)}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>Journal Cognitif</h2>
                {journal.degradationApplied && (
                    <div style={styles.degradationBadge}>
                        ⚠️ Dégradation Gracieuse
                    </div>
                )}
            </div>

            <div style={styles.metadata}>
                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Requête:</span>
                    <span style={styles.metaValue}>{journal.userQuery}</span>
                </div>
                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Durée totale:</span>
                    <span style={styles.metaValue}>{formatTime(journal.totalDuration || 0)}</span>
                </div>
                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Type:</span>
                    <span style={styles.metaValue}>{journal.type}</span>
                </div>
            </div>

            <div style={styles.stepsContainer}>
                <h3 style={styles.stepsTitle}>Étapes du Débat</h3>
                {journal.steps.map((step: JournalStep, index: number) => (
                    <div key={step.stepId} style={styles.stepCard}>
                        <div style={styles.stepHeader}>
                            <div style={styles.stepIdentifier}>
                                <span
                                    style={{
                                        ...styles.stepStatus,
                                        color: getStepStatusColor(step.status)
                                    }}
                                >
                                    {getStatusIcon(step.status)}
                                </span>
                                <span style={styles.stepNumber}>Étape {index + 1}</span>
                                <span style={styles.stepAgent}>{step.agent}</span>
                                {step.label && <span style={styles.stepLabel}>{step.label}</span>}
                            </div>
                            <span style={styles.stepDuration}>
                                {step.duration ? formatTime(step.duration) : 'En cours...'}
                            </span>
                        </div>

                        <div style={styles.stepAction}>
                            <span style={styles.actionLabel}>Action:</span>
                            <span style={styles.actionValue}>{step.action}</span>
                        </div>

                        {step.result && (
                            <div style={styles.stepResult}>
                                <span style={styles.resultLabel}>Résultat:</span>
                                <div style={styles.resultContent}>
                                    {typeof step.result === 'string'
                                        ? step.result.substring(0, 200) + (step.result.length > 200 ? '...' : '')
                                        : JSON.stringify(step.result, null, 2).substring(0, 200) + '...'}
                                </div>
                            </div>
                        )}

                        {step.error && (
                            <div style={styles.stepError}>
                                <span style={styles.errorLabel}>Erreur:</span>
                                <span style={styles.errorValue}>{step.error}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {journal.degradationApplied && (
                <div style={styles.degradationInfo}>
                    <h3 style={styles.degradationTitle}>ℹ️ Dégradation Gracieuse Appliquée</h3>
                    <p style={styles.degradationText}>{journal.degradationReason}</p>
                    <p style={styles.degradationExpl}>
                        La synthèse a été annulée et la réponse brute du premier agent a été retournée.
                    </p>
                </div>
            )}

            {journal.finalResponse && (
                <div style={styles.finalResponseContainer}>
                    <h3 style={styles.finalResponseTitle}>Réponse Finale</h3>
                    <div style={styles.finalResponseText}>
                        {journal.finalResponse}
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        display: 'flex' as const,
        flexDirection: 'column' as const,
        gap: '1.5rem',
        padding: '1.5rem',
        backgroundColor: '#111827',
        borderRadius: '0.5rem',
        border: '1px solid #374151'
    },
    emptyState: {
        display: 'flex',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: '3rem',
        color: '#9ca3af'
    },
    emptyText: {
        fontSize: '1rem',
        color: '#9ca3af'
    },
    header: {
        display: 'flex' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingBottom: '1rem',
        borderBottom: '1px solid #374151'
    },
    title: {
        margin: 0,
        color: '#60a5fa',
        fontSize: '1.25rem'
    },
    degradationBadge: {
        backgroundColor: '#fbbf24',
        color: '#000',
        padding: '0.5rem 1rem',
        borderRadius: '0.375rem',
        fontSize: '0.875rem',
        fontWeight: 'bold'
    },
    metadata: {
        display: 'grid' as const,
        gridTemplateColumns: '1fr 1fr 1fr' as const,
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.375rem'
    },
    metaItem: {
        display: 'flex' as const,
        flexDirection: 'column' as const,
        gap: '0.25rem'
    },
    metaLabel: {
        color: '#9ca3af',
        fontSize: '0.875rem'
    },
    metaValue: {
        color: '#e5e7eb',
        fontWeight: 'bold' as const
    },
    stepsContainer: {
        display: 'flex' as const,
        flexDirection: 'column' as const,
        gap: '1rem'
    },
    stepsTitle: {
        margin: '0.5rem 0',
        color: '#93c5fd',
        fontSize: '1rem'
    },
    stepCard: {
        padding: '1rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.375rem',
        border: '1px solid #374151'
    },
    stepHeader: {
        display: 'flex' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: '0.75rem'
    },
    stepIdentifier: {
        display: 'flex' as const,
        alignItems: 'center' as const,
        gap: '0.75rem'
    },
    stepStatus: {
        fontSize: '1.25rem',
        fontWeight: 'bold' as const
    },
    stepNumber: {
        color: '#9ca3af',
        fontSize: '0.875rem'
    },
    stepAgent: {
        color: '#60a5fa',
        fontWeight: 'bold' as const
    },
    stepLabel: {
        color: '#10b981',
        fontSize: '0.875rem',
        backgroundColor: '#064e3b',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem'
    },
    stepDuration: {
        color: '#fbbf24',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const
    },
    stepAction: {
        display: 'flex' as const,
        gap: '0.5rem',
        marginBottom: '0.5rem',
        color: '#d1d5db',
        fontSize: '0.875rem'
    },
    actionLabel: {
        color: '#9ca3af',
        fontWeight: 'bold' as const
    },
    actionValue: {
        color: '#d1d5db'
    },
    stepResult: {
        display: 'flex' as const,
        flexDirection: 'column' as const,
        gap: '0.5rem',
        marginBottom: '0.5rem'
    },
    resultLabel: {
        color: '#9ca3af',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const
    },
    resultContent: {
        backgroundColor: '#111827',
        padding: '0.5rem',
        borderRadius: '0.25rem',
        color: '#d1d5db',
        fontSize: '0.8rem',
        fontFamily: 'monospace',
        overflow: 'auto' as const,
        maxHeight: '100px'
    },
    stepError: {
        display: 'flex' as const,
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#7f1d1d',
        borderRadius: '0.25rem'
    },
    errorLabel: {
        color: '#fca5a5',
        fontWeight: 'bold' as const,
        fontSize: '0.875rem'
    },
    errorValue: {
        color: '#fecaca'
    },
    degradationInfo: {
        padding: '1rem',
        backgroundColor: '#78350f',
        borderRadius: '0.375rem',
        border: '1px solid #b45309'
    },
    degradationTitle: {
        margin: '0 0 0.5rem 0',
        color: '#fbbf24',
        fontSize: '1rem'
    },
    degradationText: {
        margin: '0 0 0.5rem 0',
        color: '#fef3c7'
    },
    degradationExpl: {
        margin: 0,
        color: '#fed7aa',
        fontSize: '0.875rem'
    },
    finalResponseContainer: {
        padding: '1rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.375rem',
        border: '1px solid #10b981'
    },
    finalResponseTitle: {
        margin: '0 0 0.75rem 0',
        color: '#10b981',
        fontSize: '1rem'
    },
    finalResponseText: {
        color: '#d1d5db',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-word' as const
    }
};
