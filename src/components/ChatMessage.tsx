interface Source {
  id: string;
  title: string;
}

interface ChatMessageProps {
  message: string;
  sources?: Source[];
  journal?: any;
}

const ChatMessage = ({ message, sources, journal }: ChatMessageProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center min-h-[70vh] px-6">
        <p className="text-3xl md:text-4xl text-center text-foreground font-normal leading-relaxed max-w-3xl">
          {message}
        </p>
      </div>
      
      {/* Sources Footer */}
      {sources && sources.length > 0 && (
        <div style={sourceStyles.sourcesFooter}>
          <strong style={sourceStyles.sourcesLabel}>Sources consultées :</strong>
          <div style={sourceStyles.sourcesList}>
            {sources.map(source => (
              <span key={source.id} style={sourceStyles.sourceBadge} title={source.title}>
                📄 {source.title.substring(0, 30)}{source.title.length > 30 ? '...' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Journal Display */}
      {journal && (
        <div style={sourceStyles.journalContainer}>
          {/* Journal can be rendered here if needed */}
        </div>
      )}
    </div>
  );
};

const sourceStyles = {
  sourcesFooter: {
    padding: '1rem',
    backgroundColor: '#1f2937',
    borderTop: '1px solid #374151',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '0.75rem'
  },
  sourcesLabel: {
    color: '#93c5fd',
    fontSize: '0.9rem',
    fontWeight: '500' as const
  },
  sourcesList: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '0.5rem'
  },
  sourceBadge: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#374151',
    color: '#d1d5db',
    borderRadius: '0.25rem',
    fontSize: '0.85rem',
    border: '1px solid #4b5563'
  },
  journalContainer: {
    padding: '1rem',
    backgroundColor: '#111827',
    borderRadius: '0.5rem'
  }
};

export default ChatMessage;
