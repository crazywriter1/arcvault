'use client';

import { api } from '../lib/api';
import { Icon } from './Icons';

const STATUS_STYLE = {
  pending_approval: { label: 'Pending', cls: 'bg-warn/15 text-warn border-warn/20' },
  submitted: { label: 'Submitted', cls: 'bg-brand/15 text-brand border-brand/20' },
  confirmed: { label: 'Confirmed', cls: 'bg-good/15 text-good border-good/20' },
  failed: { label: 'Failed', cls: 'bg-bad/15 text-bad border-bad/20' },
  rejected: { label: 'Rejected', cls: 'bg-white/5 text-ink-400 border-white/10' },
};

const SOURCE_ICON = {
  user: '👤',
  ai: '✦',
  rule: '⚙',
};

export default function TransactionList({ txs = [], onChange }) {
  const short = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';

  async function approve(id) { await api.approveTx(id); onChange?.(); }
  async function reject(id) { await api.rejectTx(id); onChange?.(); }
  async function sync(id) { await api.syncTx(id); onChange?.(); }

  if (!txs.length) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
          <Icon.Send className="w-4 h-4 text-ink-400" />
        </div>
        <p className="text-sm text-ink-400">No transactions yet</p>
        <p className="text-xs text-ink-500">Send USDC via chat or dashboard to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {txs.map(tx => {
        const status = STATUS_STYLE[tx.status] || STATUS_STYLE.submitted;
        return (
          <div key={tx.id} className="group px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <span className={`pill border ${status.cls}`}>{status.label}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="number text-sm font-medium text-ink-100">
                    {parseFloat(tx.amount).toFixed(2)} {tx.token_symbol}
                  </span>
                  <Icon.ArrowUpRight className="w-3 h-3 text-ink-400 flex-shrink-0" />
                  <span className="number text-xs text-ink-300 truncate">{short(tx.destination)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {tx.status === 'pending_approval' && (
                  <>
                    <button onClick={() => approve(tx.id)} className="btn-good">
                      <Icon.Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => reject(tx.id)} className="btn-bad">
                      <Icon.X className="w-3 h-3" />
                    </button>
                  </>
                )}
                {tx.status === 'submitted' && (
                  <button onClick={() => sync(tx.id)} className="btn-ghost !px-2 !py-1">
                    <Icon.Refresh className="w-3 h-3" />
                  </button>
                )}
                {tx.tx_hash && (
                  <a
                    href={`https://testnet.arcscan.app/tx/${tx.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-400 hover:text-brand transition"
                    title="View on Arcscan"
                  >
                    <Icon.ArrowUpRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="mt-1 text-[11px] text-ink-500 flex items-center gap-2">
              <span>{SOURCE_ICON[tx.initiated_by] ?? '•'} via {tx.initiated_by}</span>
              <span>·</span>
              <span>{new Date(tx.created_at).toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
