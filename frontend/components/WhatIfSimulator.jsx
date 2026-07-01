'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

export default function WhatIfSimulator() {
  const [balance, setBalance] = useState('50');
  const [threshold, setThreshold] = useState('100');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.whatIf({
        wallet: 'Treasury Primary',
        token: 'USDC',
        operator: '<',
        value: Number(threshold),
        balance: Number(balance),
      });
      if (res.error) throw new Error(res.error);
      setResult(res);
    } catch (err) {
      setResult({ summary: `Error: ${err.message}`, actions: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-warn/15 text-warn flex items-center justify-center">
          <Icon.Zap className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-100">What-If Simulator</h2>
          <p className="text-[11px] text-ink-400">Preview rule triggers at a hypothetical balance</p>
        </div>
      </div>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-[10px] text-ink-500 uppercase">If Treasury USDC =</label>
          <input
            type="number"
            className="w-full mt-1 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-ink-500 uppercase">Alert threshold &lt;</label>
          <input
            type="number"
            className="w-full mt-1 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
      </div>
      <button onClick={simulate} disabled={busy} className="btn-ghost w-full mb-3">
        {busy ? 'Simulating…' : 'Run simulation'}
      </button>
      {result && (
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 text-xs space-y-2">
          <p className="text-ink-200 leading-relaxed">{result.summary}</p>
          {result.actions?.length > 0 && (
            <ul className="space-y-1">
              {result.actions.map((a) => (
                <li key={a.rule_id} className="text-ink-400 flex gap-2">
                  <span className="text-brand">→</span>
                  <span><strong className="text-ink-300">{a.label}</strong>: {a.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {result.current_balance != null && (
            <p className="text-[10px] text-ink-500 pt-1 border-t border-white/5">
              Current: {result.current_balance} USDC · Treasury ${result.treasury_usd?.toFixed(2)} · Savings ${result.savings_usd?.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
