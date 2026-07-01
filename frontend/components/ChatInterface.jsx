'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

export default function ChatInterface({ onActionExecuted }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setLoading(true);

    const userMsg = { id: 'u-' + Date.now(), role: 'user', content: msg, created_at: Date.now() };
    setMessages(m => [...m, userMsg]);

    try {
      const res = await api.chat(msg);
      if (res.error) {
        setMessages(m => [...m, { id: 'e-' + Date.now(), role: 'assistant', content: `Error: ${res.error}`, created_at: Date.now(), isError: true }]);
      } else {
        setMessages(m => [...m, {
          id: res.id,
          role: 'assistant',
          content: res.action?.summary ?? 'OK',
          action_json: res.action ? JSON.stringify(res.action) : null,
          enrichment: res.enrichment,
          created_at: Date.now(),
        }]);
        if (res.action?.auto_created) onActionExecuted?.();
      }
    } catch (err) {
      setMessages(m => [...m, { id: 'e-' + Date.now(), role: 'assistant', content: `Network error: ${err.message}`, created_at: Date.now(), isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  async function execute(actionJson) {
    const action = typeof actionJson === 'string' ? JSON.parse(actionJson) : actionJson;
    setLoading(true);
    try {
      const res = await api.execute(action);
      const content = res.error
        ? `Failed: ${res.error}`
        : res.message ?? `Executed · ${res.status}`;
      setMessages(m => [...m, {
        id: 'x-' + Date.now(),
        role: 'assistant',
        content,
        isError: !!res.error,
        isConfirmation: !res.error,
        created_at: Date.now(),
      }]);
      onActionExecuted?.();
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    'Show all wallet balances',
    'Send 50 USDC from Treasury to Savings',
    'Alert me if Treasury drops below 100 USDC',
    'What can you do?',
  ];

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      <header className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
            <Icon.Sparkle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Treasury Agent</h2>
            <p className="text-[11px] text-ink-400">Natural language commands</p>
          </div>
        </div>
        <span className="pill bg-good/10 text-good">
          <span className="w-1.5 h-1.5 rounded-full bg-good animate-pulse-dot" />
          online
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fade-up">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mb-4">
              <Icon.Sparkle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-medium text-ink-200 mb-1">How can I help?</h3>
            <p className="text-xs text-ink-400 mb-5">Ask about balances, send transfers, or create automation rules.</p>
            <div className="space-y-1.5 w-full max-w-xs">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-ink-300 hover:bg-white/[0.06] hover:border-brand/20 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => <MessageBubble key={m.id} message={m} onExecute={execute} />)}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-400 ml-1">
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-brand animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="w-1 h-1 rounded-full bg-brand animate-pulse" style={{ animationDelay: '0.3s' }} />
            </span>
            thinking
          </div>
        )}
      </div>

      <footer className="p-3 border-t border-white/5">
        <div className="flex gap-2 items-end">
          <input
            className="flex-1 rounded-lg bg-ink-950/60 border border-white/5 px-4 py-2.5 text-sm placeholder:text-ink-500 focus:outline-none focus:border-brand/40 focus:bg-ink-950 transition"
            placeholder="Type a command…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading}
          />
          <button onClick={send} disabled={loading || !input.trim()} className="btn-primary px-3 py-2.5">
            <Icon.Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message, onExecute }) {
  const isUser = message.role === 'user';
  let action = null;
  try { action = message.action_json ? JSON.parse(message.action_json) : null; } catch {}

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm ${
          isUser
            ? 'bg-brand/10 border border-brand/25 text-ink-100 rounded-br-md'
            : message.isError
              ? 'bg-bad/10 border border-bad/25 text-ink-100 rounded-bl-md'
              : 'bg-white/[0.04] border border-white/5 text-ink-100 rounded-bl-md'
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>

        {action?.intent === 'balance_query' && message.enrichment?.balances && (
          <div className="mt-2.5 space-y-1 text-xs">
            {message.enrichment.balances.map((w, i) => (
              <div key={i} className="flex items-center justify-between py-1 px-2 rounded bg-black/20">
                <span className="text-ink-300">{w.label}</span>
                <span className="number text-ink-200">
                  {w.tokens.length ? w.tokens.map(t => `${parseFloat(t.amount).toFixed(2)} ${t.symbol}`).join(' · ') : 'boş'}
                </span>
              </div>
            ))}
          </div>
        )}

        {action?.intent === 'swap' && message.enrichment?.quote && (
          <div className="mt-2.5 text-xs text-ink-200 border-t border-white/10 pt-2.5 space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-400">Rate</span>
              <span className="number">{message.enrichment.quote.rate.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-400">You receive</span>
              <span className="number text-brand">
                {message.enrichment.quote.toAmount.toFixed(4)} {message.enrichment.quote.to}
              </span>
            </div>
          </div>
        )}

        {action?.intent === 'swap' && message.enrichment?.quote_error && (
          <div className="mt-2 text-xs text-warn">{message.enrichment.quote_error}</div>
        )}

        {action?.intent === 'report' && message.enrichment?.report && (
          <div className="mt-2.5 text-xs text-ink-200 whitespace-pre-wrap leading-relaxed border-t border-white/10 pt-2.5">
            {message.enrichment.report}
          </div>
        )}

        {action?.intent === 'clarify' && action.params?.question && (
          <div className="mt-2 text-xs text-warn flex items-start gap-1.5">
            <Icon.Bell className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{action.params.question}</span>
          </div>
        )}

        {action?.auto_created && (
          <div className="mt-2.5 pt-2 border-t border-white/10 text-[11px] text-good flex items-center gap-1">
            <Icon.Zap className="w-3 h-3" /> Rule saved — see Automation Rules below
          </div>
        )}

        {action && (action.intent === 'transfer' || action.intent === 'swap' || (action.intent === 'rule_create' && !action.auto_created)) && (
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-400 flex items-center gap-1">
              {action.requires_approval ? (
                <><Icon.Bell className="w-3 h-3 text-warn" /> Approval needed</>
              ) : (
                <><Icon.Zap className="w-3 h-3 text-good" /> Ready</>
              )}
            </span>
            <button onClick={() => onExecute(action)} className="btn-good">
              {action.intent === 'rule_create' ? 'Create rule' : action.intent === 'swap' ? 'Swap' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
