/**
 * src/components/KenshoChat.tsx
 * 
 * Composant de chat simple pour tester Kensho avec Gemma 3 270M
 * Utilise le modèle gemma-3-270m-it-MLC avec quantification int4 (q4f16_1)
 * 
 * Usage:
 * ```tsx
 * <KenshoChat />
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import { initializeKensho } from '@/kensho';
import type { KenshoAPI } from '@/kensho';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metrics?: {
    ttft?: number;
    totalTime?: number;
    tokens?: number;
    tokensPerSec?: string;
  };
}

export function KenshoChat() {
  const [kensho, setKensho] = useState<KenshoAPI | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialiser Kensho au montage
  useEffect(() => {
    const init = async () => {
      try {
        setDownloadProgress('🚀 Initialisation de Gemma 3 270M...');
        const api = await initializeKensho('gemma-3-270m', (progress) => {
          if (progress.text) {
            setDownloadProgress(`⏳ ${progress.text}`);
          }
        });
        setKensho(api);
        setInitializing(false);
        setMessages([{
          id: '0',
          role: 'system',
          content: '✅ Gemma 3 270M est prêt ! Modèle ultra-compact (270M paramètres) en int4 chargé. Prêt à discuter !'
        }]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`❌ Initialization error: ${errorMsg}`);
        setInitializing(false);
      }
    };
    init();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kensho || !input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    let response = '';
    let metrics: any = null;

    try {
      const assistantMessageId = (Date.now() + 1).toString();
      let firstToken = false;

      // Streamer la réponse
      for await (const event of kensho.dialogue.startConversation(userMessage.content)) {
        if (event.type === 'token') {
          response += event.data;

          // Mettre à jour le message en temps réel
          setMessages(prev => {
            const updated = [...prev];
            let assistantMsg = updated.find(m => m.id === assistantMessageId);

            if (!assistantMsg) {
              assistantMsg = {
                id: assistantMessageId,
                role: 'assistant',
                content: response
              };
              updated.push(assistantMsg);
            } else {
              assistantMsg.content = response;
            }

            return updated;
          });

          if (!firstToken) {
            firstToken = true;
            console.log('⚡ First token received!');
          }
        } else if (event.type === 'complete') {
          metrics = event.data.metrics;
          console.log('📊 Metrics:', metrics);

          setMessages(prev => {
            const updated = [...prev];
            const assistantMsg = updated.find(m => m.id === assistantMessageId);
            if (assistantMsg) {
              assistantMsg.metrics = metrics;
            }
            return updated;
          });
        } else if (event.type === 'error') {
          const errorMsg = event.data.message || 'Unknown error';
          setError(`Error: ${errorMsg}`);
          console.error('❌ Error:', event.data);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Error: ${errorMsg}`);
      console.error('❌ Send error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickMessage = async (msg: string) => {
    if (!kensho || loading) return;
    setInput(msg);
    // Trigger form submit
    await new Promise(resolve => setTimeout(resolve, 0));
    const form = document.querySelector('form') as HTMLFormElement;
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
  };

  if (initializing) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <h2>🚀 Initializing Kensho OS</h2>
          <p style={styles.downloadProgress}>{downloadProgress}</p>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error && !kensho) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <h2>❌ Initialization Failed</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>💬 Gemma 2 2B Chat</h1>
        <p style={styles.modelInfo}>Model: Gemma 2 2B (Q4 Official)</p>
      </div>

      <div style={styles.messagesContainer}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            ...styles.message,
            ...(msg.role === 'user' ? styles.userMessage : msg.role === 'system' ? styles.systemMessage : styles.assistantMessage)
          }}>
            <div style={styles.messageRole}>
              {msg.role === 'user' && '👤 You'}
              {msg.role === 'assistant' && '🤖 Gemma'}
              {msg.role === 'system' && 'ℹ️ System'}
            </div>
            <div style={styles.messageContent}>{msg.content}</div>
            {msg.metrics && (
              <div style={styles.metrics}>
                ⚡ TTFT: {msg.metrics.ttft}ms | {msg.metrics.tokens} tokens | {msg.metrics.tokensPerSec} tok/s
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{...styles.message, ...styles.assistantMessage}}>
            <div style={styles.messageRole}>🤖 Gemma</div>
            <div style={styles.loadingDots}>▌ ▌ ▌</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={styles.errorBar}>{error}</div>
      )}

      <div style={styles.quickButtonsContainer}>
        <button
          onClick={() => handleQuickMessage('Bonjour! Comment ça va?')}
          disabled={loading}
          style={styles.quickButton}
        >
          Salut
        </button>
        <button
          onClick={() => handleQuickMessage('Explique moi l\'intelligence artificielle en 3 phrases')}
          disabled={loading}
          style={styles.quickButton}
        >
          Explique l\'IA
        </button>
        <button
          onClick={() => handleQuickMessage('Raconte moi une blague')}
          disabled={loading}
          style={styles.quickButton}
        >
          Blague
        </button>
        <button
          onClick={() => handleQuickMessage('Quelle est la meilleure façon d\'apprendre la programmation?')}
          disabled={loading}
          style={styles.quickButton}
        >
          Programmation
        </button>
      </div>

      <form onSubmit={handleSendMessage} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? '⏳ Waiting for response...' : 'Type your message...'}
          disabled={loading || !kensho}
          style={styles.input}
        />
        <button
          type="submit"
          disabled={loading || !kensho || !input.trim()}
          style={styles.sendButton}
        >
          {loading ? '⏳' : '📤'} Send
        </button>
      </form>

      <div style={styles.footer}>
        <small>
          💾 Cached requests return in &lt;1ms | 
          🚀 First response ~2-3s | 
          ⚡ See tokens streaming in real-time
        </small>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1976d2',
    color: 'white',
    padding: '20px',
    textAlign: 'center' as const,
  },
  modelInfo: {
    margin: '5px 0 0 0',
    fontSize: '12px',
    opacity: 0.9,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px',
  },
  message: {
    marginBottom: '15px',
    padding: '12px 15px',
    borderRadius: '8px',
    maxWidth: '80%',
    wordWrap: 'break-word' as const,
  },
  userMessage: {
    backgroundColor: '#e3f2fd',
    marginLeft: 'auto',
    marginRight: '0',
  },
  assistantMessage: {
    backgroundColor: '#fff3e0',
    marginRight: 'auto',
  },
  systemMessage: {
    backgroundColor: '#f3e5f5',
    marginRight: 'auto',
    marginLeft: 'auto',
  },
  messageRole: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '5px',
    opacity: 0.8,
  },
  messageContent: {
    lineHeight: 1.5,
  },
  metrics: {
    fontSize: '10px',
    marginTop: '8px',
    opacity: 0.7,
    paddingTop: '8px',
    borderTop: '1px solid rgba(0,0,0,0.1)',
  },
  loadingDots: {
    fontSize: '14px',
    letterSpacing: '2px',
    animation: 'blink 1.4s infinite',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  downloadProgress: {
    fontSize: '14px',
    marginTop: '10px',
    color: '#666',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #1976d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginTop: '20px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    backgroundColor: '#ffebee',
  },
  errorBar: {
    backgroundColor: '#ffcdd2',
    color: '#c62828',
    padding: '10px 20px',
    borderTop: '1px solid #ef5350',
  },
  quickButtonsContainer: {
    display: 'flex',
    gap: '10px',
    padding: '10px 20px',
    backgroundColor: '#fff',
    borderTop: '1px solid #eee',
    flexWrap: 'wrap' as const,
  },
  quickButton: {
    padding: '8px 15px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.2s',
  },
  inputForm: {
    display: 'flex',
    gap: '10px',
    padding: '15px 20px',
    backgroundColor: '#fff',
    borderTop: '1px solid #eee',
  },
  input: {
    flex: 1,
    padding: '10px 15px',
    border: '1px solid #ddd',
    borderRadius: '20px',
    fontSize: '14px',
    outline: 'none',
  },
  sendButton: {
    padding: '10px 20px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  footer: {
    backgroundColor: '#f5f5f5',
    padding: '10px 20px',
    textAlign: 'center' as const,
    color: '#666',
    borderTop: '1px solid #eee',
  },
};
