'use client';

import { api } from '../lib/api';
import { Icon } from './Icons';

export default function RuleList({ rules = [], onChange }) {
  async function del(id) {
    if (!confirm('Delete this rule?')) return;
    await api.deleteRule(id);
    onChange?.();
  }
  async function evaluate() {
    const r = await api.evaluateRules();
    const fired = r.results?.filter(x => x.fired).length ?? 0;
    alert(`Evaluation complete: ${fired} rule(s) fired`);
    onChange?.();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
            <Icon.Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink-100">Automation Rules</h2>
            <p className="text-[11px] text-ink-400">{rules.length} active</p>
          </div>
        </div>
        <button onClick={evaluate} className="btn-ghost">
          <Icon.Refresh className="w-3.5 h-3.5" />
          Evaluate
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-2">
            <Icon.Zap className="w-4 h-4 text-ink-400" />
          </div>
          <p className="text-sm text-ink-400 mb-1">No automations yet</p>
          <p className="text-xs text-ink-500">
            Ask the agent: <em>"alert me when my balance drops below 100 USDC"</em>
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map(r => (
            <li key={r.id} className="group px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.enabled ? 'bg-good animate-pulse-dot' : 'bg-ink-500'}`} />
                    <span className="text-sm font-medium text-ink-100">{r.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                    <span className="pill bg-white/5 text-ink-300 number">{describeTrigger(r.trigger_config)}</span>
                    <span className="text-ink-500">→</span>
                    <span className="pill bg-brand/10 text-brand number">{describeAction(r.action_config, r.action_type)}</span>
                  </div>
                  {r.last_run && (
                    <div className="text-[10px] text-ink-500 mt-1 flex items-center gap-1">
                      <Icon.Clock className="w-2.5 h-2.5" />
                      Last run {new Date(r.last_run).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => del(r.id)}
                  className="text-ink-500 hover:text-bad transition opacity-0 group-hover:opacity-100"
                  title="Delete rule"
                >
                  <Icon.Trash className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeTrigger(t) {
  if (!t) return 'unknown';
  if (t.type === 'threshold') return `${t.wallet} ${t.token} ${t.operator} ${t.value}`;
  if (t.type === 'schedule') return `cron ${t.cron}`;
  if (t.type === 'fx_rate') return `${t.pair} ${t.operator} ${t.value}`;
  return t.type;
}

function describeAction(a, type) {
  if (type === 'alert') return `alert: ${(a.message ?? '—').slice(0, 40)}`;
  if (type === 'transfer') return `send ${a.amount} ${a.token} → ${a.to}`;
  if (type === 'swap') return `swap ${a.amount} ${a.from_token}→${a.to_token}`;
  return type;
}
