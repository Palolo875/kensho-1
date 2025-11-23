// src/ui/observatory/FeedbackPanel.tsx
import React, { useState } from 'react';

interface FeedbackPanelProps {
    queryId: string;
    onFeedback: (feedbackData: {
        queryId: string;
        rating: number;
        comment: string;
        timestamp: number;
    }) => void;
}

export function FeedbackPanel({ queryId, onFeedback }: FeedbackPanelProps) {
    const [rating, setRating] = useState<number | null>(null);
    const [comment, setComment] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (rating === null) {
            alert('Veuillez sélectionner une note');
            return;
        }

        onFeedback({
            queryId,
            rating,
            comment,
            timestamp: Date.now()
        });

        // Reset form
        setRating(null);
        setComment('');
        setSubmitted(true);

        // Clear success message after 3 seconds
        setTimeout(() => setSubmitted(false), 3000);
    };

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>💬 Donnez votre avis</h3>

            <div style={styles.section}>
                <label style={styles.label}>Comment trouvez-vous cette réponse?</label>
                <div style={styles.ratingContainer}>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            onClick={() => setRating(star)}
                            style={{
                                ...styles.starButton,
                                backgroundColor: rating && rating >= star ? '#fbbf24' : '#374151'
                            }}
                            title={`${star} étoile${star > 1 ? 's' : ''}`}
                        >
                            ★
                        </button>
                    ))}
                </div>
                {rating && <span style={styles.ratingText}>{rating} / 5</span>}
            </div>

            <div style={styles.section}>
                <label style={styles.label}>Commentaire (optionnel)</label>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Partagez vos remarques..."
                    style={styles.textarea}
                    maxLength={500}
                />
                <span style={styles.charCount}>{comment.length} / 500</span>
            </div>

            <div style={styles.buttonContainer}>
                <button
                    onClick={handleSubmit}
                    style={{
                        ...styles.submitButton,
                        opacity: rating === null ? 0.5 : 1,
                        cursor: rating === null ? 'not-allowed' : 'pointer'
                    }}
                    disabled={rating === null}
                >
                    Envoyer le feedback
                </button>
                {submitted && (
                    <span style={styles.successMessage}>✓ Feedback envoyé!</span>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        padding: '1.5rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.375rem',
        border: '1px solid #374151'
    },
    title: {
        margin: '0 0 1rem 0',
        color: '#60a5fa',
        fontSize: '1rem'
    },
    section: {
        display: 'flex' as const,
        flexDirection: 'column' as const,
        gap: '0.75rem',
        marginBottom: '1.5rem'
    },
    label: {
        color: '#d1d5db',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const
    },
    ratingContainer: {
        display: 'flex' as const,
        gap: '0.5rem'
    },
    starButton: {
        width: '2.5rem',
        height: '2.5rem',
        fontSize: '1.5rem',
        border: 'none',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        color: '#000'
    },
    ratingText: {
        color: '#fbbf24',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const
    },
    textarea: {
        width: '100%' as const,
        padding: '0.75rem',
        backgroundColor: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.375rem',
        color: '#d1d5db',
        fontFamily: 'inherit',
        resize: 'vertical' as const,
        minHeight: '80px',
        fontSize: '0.875rem'
    },
    charCount: {
        color: '#9ca3af',
        fontSize: '0.75rem'
    },
    buttonContainer: {
        display: 'flex' as const,
        gap: '1rem',
        alignItems: 'center' as const
    },
    submitButton: {
        padding: '0.75rem 1.5rem',
        backgroundColor: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: '0.375rem',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const,
        transition: 'background-color 0.2s ease'
    },
    successMessage: {
        color: '#10b981',
        fontSize: '0.875rem',
        fontWeight: 'bold' as const
    }
};
