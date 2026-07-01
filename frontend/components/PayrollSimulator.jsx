'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

export default function PayrollSimulator({ onCreated }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('200');
  const [day, setDay] = useState('1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function setup() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.setupPayroll({
        recipient: recipient.trim(),
        amount: Number(amount),
        token: 'USDC',
        day_of_month: Number(day),
      });
      if (res.error) throw new Error(res.error);
      setMsg(res.message || 'Payroll rule created');
      onCreated?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-good/15 text-good flex items-center justify-center">
          <Icon.Clock className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Payroll Simulator</h2>
          <p className="text-[11px] text-ink-400">Monthly auto-transfer from Treasury</p>
        </div>
      </div>
      <div className="space-y-2">
        <input
          className="w-full rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand/40"
          placeholder="Recipient 0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            className="flex-1 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            placeholder="Amount USDC"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            type="number"
            min="1"
            max="28"
            className="w-20 rounded-lg bg-ink-950/60 border border-white/10 px-3 py-2 text-sm number focus:outline-none focus:border-brand/40"
            title="Day of month"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <p className="text-[10px] text-ink-500">Runs 09:00 UTC on day {day} each month</p>
        <button
          onClick={setup}
          disabled={busy || !recipient.startsWith('0x')}
          className="btn-primary w-full"
        >
          {busy ? 'Creating…' : 'Setup monthly payroll'}
        </button>
        {msg && <p className="text-[11px] text-ink-300">{msg}</p>}
      </div>
    </div>
  );
}
