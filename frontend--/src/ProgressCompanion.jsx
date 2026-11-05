import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';

const SAMPLE_PROMPTS = [
  'What mistakes do I repeat most?',
  'Which rules do I break most frequently?',
  'Am I improving my discipline?',
  'What should I focus on improving this week?',
  'Which instruments show my strongest adherence?',
  'What patterns appear in my recent trades?'
];

export default function ProgressCompanion() {
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const tempIdRef = useRef(0);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversationMessages = useCallback(async (conversationId) => {
    try {
      const res = await api.getConversationMessages(conversationId, 50);
      setMessages(res?.messages || []);
    } catch (err) {
      setError(err?.message || 'Failed to load conversation history.');
    }
  }, []);

  // Initialize or fetch existing progress coaching conversation
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const res = await api.getConversations(20);
        if (!active) return;
        const convos = res?.conversations || [];

        const progressConvo = convos.find((c) => c.context_type === 'weekly_coaching' || c.title?.includes('Progress'));
        if (progressConvo) {
          setActiveConversationId(progressConvo.id);
          await loadConversationMessages(progressConvo.id);
        } else {
          // Create new progress conversation
          const created = await api.createConversation({
            title: 'Personal Progress Companion',
            context_type: 'weekly_coaching'
          });
          if (active && created?.conversation) {
            setActiveConversationId(created.conversation.id);
            setMessages([]);
          }
        }
      } catch (err) {
        if (active) setError(err?.message || 'Could not initialize companion conversation.');
      } finally {
        if (active) setLoading(false);
      }
    };

    init();
    return () => { active = false; };
  }, [loadConversationMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (textToSend) => {
    const question = (textToSend || inputQuestion).trim();
    if (!question || !activeConversationId || sending) return;

    setInputQuestion('');
    setSending(true);
    setError(null);

    tempIdRef.current += 1;
    const optimisticUserMsg = {
      id: `temp-${tempIdRef.current}`,
      role: 'user',
      content: question
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const turnResult = await api.executeProgressTurn(activeConversationId, {
        question
      });

      // Update with server returned messages
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimisticUserMsg.id);
        return [...filtered, turnResult.user_message, turnResult.assistant_message];
      });
    } catch (err) {
      setError(err?.message || 'Failed to get an answer from companion.');
    } finally {
      setSending(false);
    }
  };

  const handleStartNewConversation = async () => {
    try {
      setLoading(true);
      const created = await api.createConversation({
        title: 'Personal Progress Companion',
        context_type: 'weekly_coaching'
      });
      if (created?.conversation) {
        setActiveConversationId(created.conversation.id);
        setMessages([]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to create new conversation.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-text-primary flex h-screen items-center justify-center">Connecting to Progress Companion...</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen max-w-5xl mx-auto p-4 md:p-6 text-text-primary">
      {/* Companion Top Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-primary text-2xl">neurology</span>
            Personal Progress Companion
          </h1>
          <p className="text-xs text-text-secondary">
            Evidence-based dialogue grounded in your actual strategy, rule adherence, and trades.
          </p>
        </div>

        <button
          onClick={handleStartNewConversation}
          className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          New Session
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-adherence-broken/10 border border-adherence-broken/30 rounded-lg text-xs text-adherence-broken flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <span className="material-symbols-outlined text-3xl">psychology</span>
            </div>
            <div className="max-w-md">
              <h2 className="text-base font-semibold text-white mb-1">Ask anything about your trading progress</h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                Miroir uses deterministic records from your verified strategy and trade reviews to answer your questions accurately without hallucinating numbers.
              </p>
            </div>

            <div className="w-full max-w-lg grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
              {SAMPLE_PROMPTS.map((promptText, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(promptText)}
                  className="p-3 rounded-lg bg-surface-card border border-border-subtle hover:border-brand-primary/50 text-xs text-text-secondary hover:text-white transition-all text-left flex items-start justify-between group"
                >
                  <span className="leading-snug">{promptText}</span>
                  <span className="material-symbols-outlined text-[14px] text-text-tertiary group-hover:text-brand-primary mt-0.5">arrow_forward</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const meta = msg.metadata || {};

            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-3 ${
                    isUser
                      ? 'bg-brand-primary text-black font-medium'
                      : 'glass-card border border-border-subtle text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                      {isUser ? 'You' : 'Miroir Companion'}
                    </span>
                    {!isUser && meta.confidence_level && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-elevated text-brand-secondary border border-border-subtle font-mono">
                        [{meta.confidence_level}]
                      </span>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Evidence Cards for Assistant Messages */}
                  {!isUser && meta.observed_facts && meta.observed_facts.length > 0 && (
                    <div className="pt-2 border-t border-border-subtle space-y-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold block">
                        Deterministic Evidence
                      </span>
                      <ul className="space-y-1 text-[11px] text-text-secondary">
                        {meta.observed_facts.map((fact, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[13px] text-brand-primary mt-0.5">verified</span>
                            <span>{fact}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!isUser && meta.coaching_recommendation && (
                    <div className="p-2.5 bg-brand-secondary/10 border border-brand-secondary/30 rounded-lg text-[11px]">
                      <span className="text-[10px] uppercase tracking-wider text-brand-secondary font-bold block mb-0.5">
                        Recommended Behavioral Focus
                      </span>
                      <p className="text-text-primary">{meta.coaching_recommendation}</p>
                    </div>
                  )}

                  {!isUser && meta.data_limitations && (
                    <p className="text-[10px] text-text-tertiary italic">
                      Note: {meta.data_limitations}
                    </p>
                  )}
                </div>

                {/* Suggested follow-up buttons under latest assistant response */}
                {!isUser && idx === messages.length - 1 && meta.suggested_followups && meta.suggested_followups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                    {meta.suggested_followups.map((followup, fIdx) => (
                      <button
                        key={fIdx}
                        onClick={() => handleSendMessage(followup)}
                        className="px-2.5 py-1 rounded-full bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle text-[11px] text-text-secondary hover:text-white transition-colors"
                      >
                        {followup}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary p-2">
            <span className="material-symbols-outlined animate-spin text-[16px] text-brand-primary">progress_activity</span>
            <span>Grounding evidence and generating answer...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="relative"
      >
        <input
          type="text"
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          placeholder="Ask about your rule adherence, mistakes, or discipline progress..."
          disabled={sending}
          className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 pr-12 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputQuestion.trim() || sending}
          className="absolute right-2 top-2 p-1.5 rounded-lg bg-brand-primary text-black disabled:opacity-30 disabled:hover:bg-brand-primary transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">send</span>
        </button>
      </form>
    </div>
  );
}
