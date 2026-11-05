import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  needs_review: { label: 'Needs Review', color: 'bg-amber-950/60 text-amber-400 border-amber-800/60' },
  confirmed: { label: 'Confirmed Baseline', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  archived: { label: 'Archived', color: 'bg-red-950/60 text-red-400 border-red-800/60' }
};

const VALIDATION_BADGES = {
  COMPLETE: { label: 'Complete & Coherent', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60', icon: 'check_circle' },
  INCOMPLETE: { label: 'Incomplete', color: 'text-amber-400 bg-amber-950/60 border-amber-800/60', icon: 'error' },
  AMBIGUOUS: { label: 'Ambiguous Rules', color: 'text-blue-400 bg-blue-950/60 border-blue-800/60', icon: 'help' },
  CONTRADICTORY: { label: 'Contradictory', color: 'text-red-400 bg-red-950/60 border-red-800/60', icon: 'cancel' },
  NEEDS_TRADER_CONFIRMATION: { label: 'Needs Review', color: 'text-purple-400 bg-purple-950/60 border-purple-800/60', icon: 'visibility' }
};

const EXTRACTION_BADGES = {
  PROVIDED: { label: 'Defined', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' },
  NOT_PROVIDED: { label: 'Missing', color: 'text-zinc-500 bg-zinc-900 border-zinc-800' },
  UNCLEAR: { label: 'Unclear', color: 'text-amber-400 bg-amber-950/40 border-amber-800/40' },
  CONFLICTING: { label: 'Conflicting', color: 'text-red-400 bg-red-950/40 border-red-800/40' },
  NEEDS_CONFIRMATION: { label: 'Needs Confirm', color: 'text-blue-400 bg-blue-950/40 border-blue-800/40' }
};

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function Strategy() {
  const [strategies, setStrategies] = useState([]);
  const [currentStrategy, setCurrentStrategy] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('companion'); // 'companion' | 'manual' | 'validation'
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [latestExtraction, setLatestExtraction] = useState(null);
  const [latestSuggestions, setLatestSuggestions] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [acknowledgeAmbiguity, setAcknowledgeAmbiguity] = useState(false);

  // Validation report state
  const [validationReport, setValidationReport] = useState(null);
  const [aiExplaining, setAiExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');

  // Editable working draft synchronized between manual and AI modes
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    markets: [],
    timeframes: [],
    entry_conditions: [],
    stop_loss_method: { type: 'swing_low', description: '' },
    exit_plan: { type: 'take_profit', description: '' },
    risk_rules: [],
    position_sizing_rules: [],
    draft_trading_schedule: { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], start_time: '08:00', end_time: '16:00', timezone: 'UTC' },
    other_restrictions: [],
    preferences: []
  });

  const chatBottomRef = useRef(null);

  const populateDraftFromStrategy = useCallback((strat) => {
    if (!strat) return;
    setDraft({
      name: strat.name || '',
      description: strat.description || '',
      markets: Array.isArray(strat.markets) ? strat.markets : [],
      timeframes: Array.isArray(strat.timeframes) ? strat.timeframes : [],
      entry_conditions: Array.isArray(strat.entry_conditions) ? strat.entry_conditions : [],
      stop_loss_method: strat.stop_loss_method || { type: 'swing_low', description: '' },
      exit_plan: strat.exit_plan || { type: 'take_profit', description: '' },
      risk_rules: Array.isArray(strat.risk_rules) ? strat.risk_rules : (strat.draft_rules || []).filter(r => r.dimension === 'risk'),
      position_sizing_rules: Array.isArray(strat.position_sizing_rules) ? strat.position_sizing_rules : (strat.draft_rules || []).filter(r => r.dimension === 'sizing'),
      draft_trading_schedule: strat.draft_trading_schedule || strat.trading_schedule || { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], start_time: '08:00', end_time: '16:00', timezone: 'UTC' },
      other_restrictions: Array.isArray(strat.other_restrictions) ? strat.other_restrictions : [],
      preferences: Array.isArray(strat.preferences) ? strat.preferences : []
    });
  }, []);

  const refreshValidation = useCallback(async (strategyId) => {
    if (!strategyId) return;
    try {
      const res = await api.validateStrategy(strategyId);
      setValidationReport(res?.validation || null);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadConversationState = useCallback(async (convoId) => {
    try {
      const state = await api.getConversationStrategyState(convoId);
      setMessages(state?.messages || []);
      if (state?.extraction) {
        setLatestExtraction(state.extraction);
      }
      if (state?.strategy) {
        setCurrentStrategy(state.strategy);
        populateDraftFromStrategy(state.strategy);
        refreshValidation(state.strategy.id);
      }
    } catch {
      const msgRes = await api.getConversationMessages(convoId);
      setMessages(msgRes?.messages || []);
    }
  }, [populateDraftFromStrategy, refreshValidation]);

  // Initialize data
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        setLoading(true);
        const [stratRes, convoRes] = await Promise.all([
          api.getStrategies(),
          api.getConversations(20)
        ]);
        if (!active) return;

        const stratList = stratRes?.strategies || [];
        setStrategies(stratList);

        let selectedStrategy = stratList[0] || null;
        if (!selectedStrategy) {
          const created = await api.createStrategy({ name: 'My Core Strategy', status: 'draft' });
          selectedStrategy = created.strategy;
          setStrategies([selectedStrategy]);
        }
        setCurrentStrategy(selectedStrategy);
        populateDraftFromStrategy(selectedStrategy);
        refreshValidation(selectedStrategy.id);

        const convoList = convoRes?.conversations || [];
        setConversations(convoList);

        let companionConvo = convoList.find((c) => c.strategy_id === selectedStrategy.id);
        if (!companionConvo && convoList.length > 0) {
          companionConvo = convoList[0];
        }
        if (!companionConvo) {
          const newConvoRes = await api.createConversation({
            title: `${selectedStrategy.name} Companion`,
            context_type: 'strategy_refinement',
            strategy_id: selectedStrategy.id
          });
          companionConvo = newConvoRes.conversation;
          setConversations([companionConvo]);
        }
        setActiveConversationId(companionConvo.id);
        await loadConversationState(companionConvo.id);
      } catch (err) {
        if (active) setError(err?.message || 'Could not load Strategy Companion.');
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => { active = false; };
  }, [populateDraftFromStrategy, loadConversationState, refreshValidation]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(textToSend) {
    const text = (textToSend || inputText).trim();
    if (!text || sending || !activeConversationId) return;

    setInputText('');
    setSending(true);
    setError('');

    const tempUserMsg = { id: `temp-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.executeCompanionTurn(activeConversationId, {
        content: text,
        strategy_id: currentStrategy?.id
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        res.user_message,
        res.assistant_message
      ]);

      if (res.strategy) {
        setCurrentStrategy(res.strategy);
        populateDraftFromStrategy(res.strategy);
        setStrategies((prev) => prev.map((s) => (s.id === res.strategy.id ? res.strategy : s)));
        refreshValidation(res.strategy.id);
      }

      if (res.extraction) {
        setLatestExtraction(res.extraction);
      }
      if (Array.isArray(res.suggestions)) {
        setLatestSuggestions(res.suggestions);
      }
    } catch (err) {
      setError(err?.message || 'Failed to send message to Strategy Companion.');
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    if (!currentStrategy) return;
    setSavingDraft(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.updateStrategyDraft(currentStrategy.id, {
        name: draft.name,
        description: draft.description,
        markets: draft.markets,
        timeframes: draft.timeframes,
        entry_conditions: draft.entry_conditions,
        stop_loss_method: draft.stop_loss_method,
        exit_plan: draft.exit_plan,
        risk_rules: draft.risk_rules,
        position_sizing_rules: draft.position_sizing_rules,
        draft_trading_schedule: draft.draft_trading_schedule,
        other_restrictions: draft.other_restrictions,
        preferences: draft.preferences
      });
      setCurrentStrategy(res.strategy);
      setStrategies((prev) => prev.map((s) => (s.id === res.strategy.id ? res.strategy : s)));
      await refreshValidation(res.strategy.id);
      setSuccessMsg('Draft strategy successfully saved.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err?.message || 'Could not save draft strategy.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleExplainValidation() {
    if (!currentStrategy) return;
    setAiExplaining(true);
    try {
      const res = await api.explainStrategyValidation(currentStrategy.id);
      setAiExplanation(res?.explanation || 'No validation remarks available.');
    } catch (err) {
      setError(err?.message || 'Could not explain validation issues.');
    } finally {
      setAiExplaining(false);
    }
  }

  async function handleConfirmStrategy() {
    if (!currentStrategy) return;
    setSavingDraft(true);
    setError('');
    try {
      const res = await api.confirmStrategyVersion(currentStrategy.id, {
        change_summary: changeSummary.trim() || 'Confirmed strategy version',
        acknowledge_ambiguity: acknowledgeAmbiguity
      });
      setCurrentStrategy(res.strategy);
      populateDraftFromStrategy(res.strategy);
      setStrategies((prev) => prev.map((s) => (s.id === res.strategy.id ? res.strategy : s)));
      await refreshValidation(res.strategy.id);
      setConfirmModalOpen(false);
      setChangeSummary('');
      setAcknowledgeAmbiguity(false);
      setSuccessMsg(`Version ${res.version.version_number} confirmed as authoritative trading baseline.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setError(err?.message || 'Could not confirm strategy.');
      if (err?.code === 'STRATEGY_INCOMPLETE' || err?.code === 'STRATEGY_CONTRADICTORY' || err?.code === 'STRATEGY_AMBIGUOUS') {
        refreshValidation(currentStrategy.id);
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleStartNewConversation() {
    try {
      const newConvo = await api.createConversation({
        title: `${draft.name || 'Strategy'} Discussion`,
        context_type: 'strategy_refinement',
        strategy_id: currentStrategy?.id
      });
      setConversations((prev) => [newConvo.conversation, ...prev]);
      setActiveConversationId(newConvo.conversation.id);
      setMessages([]);
      setLatestSuggestions([]);
    } catch (err) {
      setError(err?.message || 'Could not start new conversation.');
    }
  }

  // Calculate dimension completion summary
  const dimensions = [
    { key: 'name', label: 'Strategy Name', value: draft.name, isDefined: Boolean(draft.name) },
    { key: 'markets', label: 'Markets / Instruments', value: draft.markets, isDefined: draft.markets.length > 0 },
    { key: 'timeframes', label: 'Timeframes', value: draft.timeframes, isDefined: draft.timeframes.length > 0 },
    { key: 'entry_conditions', label: 'Entry Conditions', value: draft.entry_conditions, isDefined: draft.entry_conditions.length > 0 },
    { key: 'stop_loss_method', label: 'Stop-Loss Method', value: draft.stop_loss_method?.type, isDefined: Boolean(draft.stop_loss_method?.description || draft.stop_loss_method?.type) },
    { key: 'exit_plan', label: 'Exit Plan', value: draft.exit_plan?.type, isDefined: Boolean(draft.exit_plan?.description || draft.exit_plan?.type) },
    { key: 'risk_rules', label: 'Risk Rules', value: draft.risk_rules, isDefined: draft.risk_rules.length > 0 },
    { key: 'position_sizing_rules', label: 'Position Sizing', value: draft.position_sizing_rules, isDefined: draft.position_sizing_rules.length > 0 },
    { key: 'draft_trading_schedule', label: 'Trading Schedule', value: draft.draft_trading_schedule, isDefined: Boolean(draft.draft_trading_schedule?.start_time) },
    { key: 'other_restrictions', label: 'Strict Restrictions', value: draft.other_restrictions, isDefined: draft.other_restrictions.length > 0 },
    { key: 'preferences', label: 'Preferences (Flexible)', value: draft.preferences, isDefined: draft.preferences.length > 0 }
  ];

  const definedCount = dimensions.filter((d) => d.isDefined).length;
  const progressPct = Math.round((definedCount / dimensions.length) * 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-4xl text-brand-primary animate-pulse">psychology</span>
          <p className="text-sm text-text-secondary">Loading Miroir Strategy Companion…</p>
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_CONFIG[currentStrategy?.status] || STATUS_CONFIG.draft;
  const valBadge = VALIDATION_BADGES[validationReport?.status] || VALIDATION_BADGES.INCOMPLETE;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-text-primary pb-24">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center text-brand-primary shrink-0">
            <span className="material-symbols-outlined text-2xl">psychology</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-white">{draft.name || 'Untitled Strategy'}</h1>
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${valBadge.color}`}>
                <span className="material-symbols-outlined text-[12px]">{valBadge.icon}</span>
                {valBadge.label}
              </span>
              {currentStrategy?.version_number ? (
                <span className="text-[10px] font-mono bg-surface-elevated border border-border-subtle px-2 py-0.5 rounded text-text-secondary">
                  v{currentStrategy.version_number}
                </span>
              ) : null}

              {/* Multi-strategy selector */}
              {strategies.length > 1 && (
                <select
                  value={currentStrategy?.id || ''}
                  onChange={(e) => {
                    const selected = strategies.find((s) => s.id === e.target.value);
                    if (selected) {
                      setCurrentStrategy(selected);
                      populateDraftFromStrategy(selected);
                      refreshValidation(selected.id);
                      const matchedConvo = conversations.find((c) => c.strategy_id === selected.id);
                      if (matchedConvo) {
                        setActiveConversationId(matchedConvo.id);
                        loadConversationState(matchedConvo.id);
                      }
                    }
                  }}
                  className="bg-surface-elevated border border-border-subtle rounded-lg px-2 py-0.5 text-xs text-text-secondary focus:outline-none focus:border-brand-primary"
                >
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              Miroir AI Strategy Companion · Articulate rules, manage drafts, and establish execution baselines.
            </p>
          </div>
        </div>

        {/* Global Strategy Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={savingDraft || currentStrategy?.status === 'archived'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-elevated border border-border-subtle hover:border-text-secondary transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>

          <button
            onClick={() => setConfirmModalOpen(true)}
            disabled={currentStrategy?.status === 'archived'}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary text-white hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">verified</span>
            Confirm Baseline
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 mb-6 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-3 mb-6 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* AI Validation Explanation Banner if triggered */}
      {aiExplanation && (
        <div className="p-4 mb-6 rounded-xl bg-surface-elevated border border-brand-primary/40 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-brand-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">neurology</span>
              AI Validation Diagnostics & Suggestions
            </h4>
            <button onClick={() => setAiExplanation('')} className="text-text-tertiary hover:text-white text-xs">✕ Close</button>
          </div>
          <p className="whitespace-pre-line text-text-primary leading-relaxed">{aiExplanation}</p>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="inline-flex p-1 rounded-xl bg-surface-card border border-border-subtle">
          <button
            onClick={() => setActiveTab('companion')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'companion'
                ? 'bg-surface-elevated text-white border border-border-subtle shadow-sm'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">chat</span>
            AI Companion (Conversation)
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'manual'
                ? 'bg-surface-elevated text-white border border-border-subtle shadow-sm'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">edit_note</span>
            Manual Specification
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'validation'
                ? 'bg-surface-elevated text-white border border-border-subtle shadow-sm'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">rule</span>
            Validation Audit ({validationReport?.issues?.length || 0})
          </button>
        </div>

        {/* Progress summary capsule */}
        <div className="flex items-center gap-3 bg-surface-card border border-border-subtle px-3 py-1.5 rounded-xl">
          <span className="text-[11px] text-text-secondary">Defined Dimensions:</span>
          <div className="w-24 bg-surface-elevated rounded-full h-2 overflow-hidden border border-border-subtle">
            <div className="bg-brand-primary h-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[11px] font-mono text-white font-medium">{definedCount}/{dimensions.length} ({progressPct}%)</span>
        </div>
      </div>

      {/* Main Mode Views */}
      {activeTab === 'companion' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Chat Thread */}
          <div className="lg:col-span-2 flex flex-col h-[650px] glass-card overflow-hidden">
            {/* Conversation Header Bar */}
            <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-surface-card/80">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-brand-primary">forum</span>
                <span className="text-xs font-medium text-white truncate max-w-xs">
                  {conversations.find((c) => c.id === activeConversationId)?.title || 'Strategy Consultation'}
                </span>
              </div>
              <button
                onClick={handleStartNewConversation}
                className="text-[11px] text-text-secondary hover:text-brand-primary flex items-center gap-1 transition-colors"
                title="Start a fresh conversation thread"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                New Conversation
              </button>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-secondary">
                  <div className="w-12 h-12 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center text-brand-primary mb-3">
                    <span className="material-symbols-outlined text-2xl">neurology</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">Miroir AI Strategy Companion</h3>
                  <p className="text-xs max-w-sm mb-4">
                    Describe your trading style naturally. I ask one focused question at a time to help define your strict rules versus preferences.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-md">
                    <button
                      onClick={() => handleSend('I trade breakout setups on BTC and ETH on the 1h chart.')}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle hover:border-brand-primary text-text-secondary hover:text-white transition-all text-left"
                    >
                      "I trade breakout setups on BTC and ETH on the 1h chart."
                    </button>
                    <button
                      onClick={() => handleSend('I want to define strict risk rules: maximum $100 per trade and no trading during FOMC.')}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle hover:border-brand-primary text-text-secondary hover:text-white transition-all text-left"
                    >
                      "I want to define strict risk rules: max $100 per trade."
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-brand-primary shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[16px]">neurology</span>
                        </div>
                      )}
                      <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-brand-primary text-white rounded-tr-none'
                          : 'bg-surface-elevated border border-border-subtle text-text-primary rounded-tl-none'
                      }`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {m.metadata?.turn_status === 'fallback' && (
                          <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1 opacity-80">
                            <span className="material-symbols-outlined text-[12px]">info</span>
                            Offline Companion Guidance
                          </div>
                        )}
                      </div>
                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-text-secondary shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[16px]">person</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Suggestions Pills if available */}
            {latestSuggestions.length > 0 && (
              <div className="px-4 py-2 border-t border-border-subtle/40 bg-surface-card/40 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold mr-1">Suggestions:</span>
                {latestSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(`Yes, let's add that: ${s}`)}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle hover:border-brand-primary text-text-secondary hover:text-white transition-all text-left"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 border-t border-border-subtle bg-surface-card">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Tell Miroir about your rules, timeframes, or risk..."
                  disabled={sending}
                  className="flex-1 bg-surface-elevated border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-text-tertiary focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="w-10 h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {sending ? 'hourglass_empty' : 'arrow_upward'}
                  </span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Col: Live Strategy Extraction Status & Progress */}
          <div className="space-y-4">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-brand-primary">checklist</span>
                  Strategy Dimension Status
                </h3>
                <span className="text-[10px] font-mono text-brand-primary font-bold">{definedCount}/11 Defined</span>
              </div>

              <div className="space-y-2">
                {dimensions.map((dim) => {
                  const extInfo = latestExtraction?.[dim.key];
                  const statusKey = extInfo?.status || (dim.isDefined ? 'PROVIDED' : 'NOT_PROVIDED');
                  const badge = EXTRACTION_BADGES[statusKey] || EXTRACTION_BADGES.NOT_PROVIDED;

                  return (
                    <div key={dim.key} className="p-2.5 rounded-lg bg-surface-elevated border border-border-subtle/60 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-white truncate">{dim.label}</p>
                        <p className="text-[10px] text-text-tertiary truncate">
                          {Array.isArray(dim.value) ? `${dim.value.length} item(s)` : (typeof dim.value === 'string' && dim.value) ? dim.value : 'Not yet defined'}
                        </p>
                      </div>
                      <span className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Validation quick summary widget */}
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-brand-primary">verified_user</span>
                  Validation Status
                </span>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${valBadge.color}`}>
                  {valBadge.label}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                {validationReport?.issues?.length || 0} issue(s) detected. Check the <strong>Validation Audit</strong> tab to inspect rules before baseline confirmation.
              </p>
              <button
                onClick={handleExplainValidation}
                disabled={aiExplaining}
                className="w-full text-center text-[11px] py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-brand-primary hover:text-white transition-colors"
              >
                {aiExplaining ? 'Analyzing with AI…' : 'Explain Validation with AI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'manual' && (
        /* Manual Specification Form View */
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Manual Strategy Specification</h2>
              <p className="text-xs text-text-secondary">Directly view and edit all strategy parameters.</p>
            </div>
            <button
              onClick={() => setActiveTab('companion')}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">chat</span>
              Discuss with AI Companion
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strategy Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                Strategy Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. BTC Trend Continuation"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                Description / Core Philosophy
              </label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="High-probability continuation on 1h structure"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>

            {/* Markets */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                Markets & Instruments (comma separated)
              </label>
              <input
                type="text"
                value={draft.markets.join(', ')}
                onChange={(e) => setDraft({ ...draft, markets: e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) })}
                placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary font-mono"
              />
            </div>

            {/* Timeframes */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                Timeframes (comma separated)
              </label>
              <input
                type="text"
                value={draft.timeframes.join(', ')}
                onChange={(e) => setDraft({ ...draft, timeframes: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) })}
                placeholder="15m, 1h, 4h"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary font-mono"
              />
            </div>
          </div>

          {/* Entry Conditions */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
              Entry Conditions (one per line)
            </label>
            <textarea
              rows={3}
              value={draft.entry_conditions.join('\n')}
              onChange={(e) => setDraft({ ...draft, entry_conditions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              placeholder="Breakout above previous 4h high with volume confirmation&#10;Clean retest of the broken level on 15m"
              className="w-full bg-surface-elevated border border-border-subtle rounded-lg p-3 text-xs text-white focus:outline-none focus:border-brand-primary leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stop Loss Method */}
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">
                Stop-Loss Method
              </label>
              <select
                value={draft.stop_loss_method?.type || 'swing_low'}
                onChange={(e) => setDraft({ ...draft, stop_loss_method: { ...draft.stop_loss_method, type: e.target.value } })}
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-white mb-2 focus:outline-none focus:border-brand-primary"
              >
                <option value="swing_low">Swing Low / High Structure</option>
                <option value="atr">ATR (Average True Range)</option>
                <option value="percentage">Fixed Percentage</option>
                <option value="custom">Custom Condition</option>
              </select>
              <input
                type="text"
                value={draft.stop_loss_method?.description || ''}
                onChange={(e) => setDraft({ ...draft, stop_loss_method: { ...draft.stop_loss_method, description: e.target.value } })}
                placeholder="e.g. 5 ticks below previous 1h swing low"
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>

            {/* Exit Plan */}
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">
                Exit & Take-Profit Plan
              </label>
              <select
                value={draft.exit_plan?.type || 'take_profit'}
                onChange={(e) => setDraft({ ...draft, exit_plan: { ...draft.exit_plan, type: e.target.value } })}
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-white mb-2 focus:outline-none focus:border-brand-primary"
              >
                <option value="take_profit">Fixed R:R Target (e.g. 2R)</option>
                <option value="trailing">Trailing Stop Behind Structure</option>
                <option value="partials">Partial Scaling Out</option>
                <option value="custom">Custom Exit Plan</option>
              </select>
              <input
                type="text"
                value={draft.exit_plan?.description || ''}
                onChange={(e) => setDraft({ ...draft, exit_plan: { ...draft.exit_plan, description: e.target.value } })}
                placeholder="e.g. Exit 50% at 2R, trail rest behind 15m structure"
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Strict Restrictions vs Flexible Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-red-400 mb-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">block</span>
                Strict Restrictions (Hard Rules - one per line)
              </label>
              <textarea
                rows={3}
                value={draft.other_restrictions.join('\n')}
                onChange={(e) => setDraft({ ...draft, other_restrictions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Never enter 15m before high-impact economic news&#10;Never hold positions over weekend"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg p-3 text-xs text-white focus:outline-none focus:border-brand-primary leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Trader Preferences (Flexible Guidelines - one per line)
              </label>
              <textarea
                rows={3}
                value={draft.preferences.join('\n')}
                onChange={(e) => setDraft({ ...draft, preferences: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Prefer trading London / New York overlap session&#10;Prefer setups with above-average volume"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg p-3 text-xs text-white focus:outline-none focus:border-brand-primary leading-relaxed"
              />
            </div>
          </div>

          {/* Trading Schedule */}
          <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Trading Schedule
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">Trading Days</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_DAYS.map((day) => {
                    const active = draft.draft_trading_schedule?.days?.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const currentDays = draft.draft_trading_schedule?.days || [];
                          const newDays = active ? currentDays.filter((d) => d !== day) : [...currentDays, day];
                          setDraft({
                            ...draft,
                            draft_trading_schedule: { ...draft.draft_trading_schedule, days: newDays }
                          });
                        }}
                        className={`text-[10px] px-2 py-1 rounded border capitalize ${
                          active
                            ? 'bg-brand-primary text-white border-brand-primary font-semibold'
                            : 'bg-surface-card border-border-subtle text-text-secondary hover:text-white'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-text-secondary mb-1">Start & End Time (24h)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft.draft_trading_schedule?.start_time || '08:00'}
                    onChange={(e) => setDraft({
                      ...draft,
                      draft_trading_schedule: { ...draft.draft_trading_schedule, start_time: e.target.value }
                    })}
                    placeholder="08:00"
                    className="w-20 bg-surface-card border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white text-center font-mono"
                  />
                  <span className="text-text-secondary">-</span>
                  <input
                    type="text"
                    value={draft.draft_trading_schedule?.end_time || '16:00'}
                    onChange={(e) => setDraft({
                      ...draft,
                      draft_trading_schedule: { ...draft.draft_trading_schedule, end_time: e.target.value }
                    })}
                    placeholder="16:00"
                    className="w-20 bg-surface-card border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white text-center font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-text-secondary mb-1">Timezone</label>
                <input
                  type="text"
                  value={draft.draft_trading_schedule?.timezone || 'UTC'}
                  onChange={(e) => setDraft({
                    ...draft,
                    draft_trading_schedule: { ...draft.draft_trading_schedule, timezone: e.target.value }
                  })}
                  placeholder="UTC"
                  className="w-24 bg-surface-card border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || currentStrategy?.status === 'archived'}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-surface-elevated border border-border-subtle hover:border-text-secondary text-white transition-all disabled:opacity-50"
            >
              {savingDraft ? 'Saving Draft…' : 'Save Draft Specification'}
            </button>
            <button
              onClick={() => setConfirmModalOpen(true)}
              disabled={currentStrategy?.status === 'archived'}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-brand-primary text-white hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50"
            >
              Confirm as Baseline
            </button>
          </div>
        </div>
      )}

      {activeTab === 'validation' && (
        /* Validation Audit Panel */
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-white">Strategy Validation & Integrity Audit</h2>
                <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${valBadge.color}`}>
                  <span className="material-symbols-outlined text-[13px]">{valBadge.icon}</span>
                  {valBadge.label}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                Objective integrity evaluation to ensure strategy rules are unambiguous and non-contradictory.
              </p>
            </div>
            <button
              onClick={handleExplainValidation}
              disabled={aiExplaining}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-surface-elevated border border-border-subtle hover:border-brand-primary text-brand-primary hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              {aiExplaining ? 'Explaining…' : 'AI Explanation'}
            </button>
          </div>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-emerald-400">Completed Fields</span>
              <p className="text-xl font-bold text-white mt-1">{validationReport?.completed_fields?.length || 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-amber-400">Missing Fields</span>
              <p className="text-xl font-bold text-white mt-1">{validationReport?.missing_fields?.length || 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-blue-400">Ambiguities</span>
              <p className="text-xl font-bold text-white mt-1">{validationReport?.ambiguous_fields?.length || 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-red-400">Contradictions</span>
              <p className="text-xl font-bold text-white mt-1">{validationReport?.contradictory_fields?.length || 0}</p>
            </div>
          </div>

          {/* Issue breakdown */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Detected Validation Issues & Recommendations
            </h3>
            {validationReport?.issues?.length === 0 ? (
              <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-emerald-300 text-xs flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-emerald-400">verified</span>
                <div>
                  <p className="font-semibold text-white">Strategy is complete and consistent</p>
                  <p className="text-emerald-400/80">No contradictory conditions or missing required parameters found. Ready for confirmation.</p>
                </div>
              </div>
            ) : (
              validationReport?.issues?.map((issue, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-surface-elevated border border-border-subtle space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white capitalize">{issue.field.replace('_', ' ')}</span>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                      issue.severity === 'error' ? 'text-red-400 bg-red-950/40 border-red-800/40' : 'text-amber-400 bg-amber-950/40 border-amber-800/40'
                    }`}>
                      {issue.code}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-[11px] text-brand-primary pt-1">💡 {issue.suggestion}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal with Validation Gate */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0">
                <span className="material-symbols-outlined text-xl">verified</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Strategy Baseline</h3>
                <p className="text-xs text-text-secondary">Establish an authoritative immutable trading baseline.</p>
              </div>
            </div>

            {/* Validation gate status */}
            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${valBadge.color}`}>
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">{valBadge.icon}</span>
              <div>
                <p className="font-semibold">{valBadge.label}</p>
                <p className="text-[11px] opacity-90">
                  {validationReport?.is_valid_for_confirmation
                    ? 'All required parameters are verified. You can now confirm this strategy as your official execution baseline.'
                    : `Validation detected blocking issues (${validationReport?.status}). Please resolve missing fields or contradictions before confirmation.`}
                </p>
              </div>
            </div>

            {/* If ambiguous, show explicit acknowledgement checkbox */}
            {validationReport?.status === 'AMBIGUOUS' && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-elevated border border-blue-900/40 text-xs text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledgeAmbiguity}
                  onChange={(e) => setAcknowledgeAmbiguity(e.target.checked)}
                  className="mt-0.5 rounded border-border-subtle bg-surface-card text-brand-primary focus:ring-0"
                />
                <span className="text-[11px]">
                  I understand that some entry/exit rules use subjective wording, and I explicitly acknowledge these rules as my baseline.
                </span>
              </label>
            )}

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Change Summary (Audit Log Note)
              </label>
              <input
                type="text"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="e.g. Initial strategy confirmation for Q4"
                className="w-full bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStrategy}
                disabled={savingDraft || (!validationReport?.is_valid_for_confirmation && !(validationReport?.status === 'AMBIGUOUS' && acknowledgeAmbiguity))}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary text-white hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingDraft ? 'Confirming…' : 'Confirm Version Baseline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
