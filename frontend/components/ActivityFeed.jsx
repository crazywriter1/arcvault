'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

const KIND_ICON = {
  ping: '☀️',
  swap: '⇄',
  transfer: '→',
  deposit: '↓',
  withdraw: '↑',
};

export default function ActivityFeed({ refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.activityFeed()
      .then((r) => {
        if (r?.error) throw new Error(r.error);
        setItems(r.items ?? []);
      })
      .catch((err) => {
        setItems([]);
        setError(err?.message || 'Could not load activity');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
          <Icon.Clock className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-ink-100">Activity Feed</h2>
          <p className="text-[11px] text-ink-400">On-chain + treasury events</p>
        </div>
        {!loading && (
          <button type="button" onClick={load} className="text-[10px] text-brand hover:underline">
            Refresh
          </button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-ink-400 py-6 text-center">Loading activity…</p>
      )}

      {!loading && error && (
        <div className="py-4 text-center space-y-2">
          <p className="text-xs text-bad">{error}</p>
          <button type="button" onClick={load} className="text-[11px] text-brand hover:underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && !items.length && (
        <p className="text-xs text-ink-400 py-6 text-center">
          No activity yet — deposit, withdraw, GM/GN, or a transfer
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 py-2 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <div className="text-xs font-medium text-ink-100 truncate">
                  {KIND_ICON[item.kind] || '•'} {item.title}
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5">
                  {item.source} · {formatWhen(item.created_at)}
                </div>
              </div>
              {item.explorer_url ? (
                <a
                  href={item.explorer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill bg-white/5 text-brand hover:bg-brand/10 text-[10px] flex-shrink-0"
                >
                  Arcscan <Icon.ArrowUpRight className="w-3 h-3" />
                </a>
              ) : (
                <span className="pill bg-white/5 text-ink-400 text-[10px]">{item.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
