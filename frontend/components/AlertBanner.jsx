'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

const LEVEL = {
  info: { cls: 'bg-brand/8 border-brand/20 text-brand' },
  warn: { cls: 'bg-warn/10 border-warn/25 text-warn' },
  critical: { cls: 'bg-bad/10 border-bad/30 text-bad' },
};

export default function AlertBanner() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const load = () => api.alerts().then(r => setAlerts(r.alerts ?? []));
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  async function dismissAll() {
    await api.markAlertsRead();
    setAlerts(alerts.map(a => ({ ...a, read: 1 })));
  }

  const unread = alerts.filter(a => !a.read);
  if (!unread.length) return null;

  return (
    <div className="space-y-2 mb-6 animate-fade-up">
      {unread.slice(0, 3).map(a => {
        const style = LEVEL[a.level] || LEVEL.info;
        return (
          <div key={a.id} className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${style.cls}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Icon.Bell className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{a.message}</span>
            </div>
            <span className="text-[11px] opacity-60 flex-shrink-0 number">
              {new Date(a.created_at).toLocaleTimeString()}
            </span>
          </div>
        );
      })}
      <button onClick={dismissAll} className="text-[11px] text-ink-400 hover:text-ink-200 ml-1">
        Mark all as read ({unread.length})
      </button>
    </div>
  );
}
