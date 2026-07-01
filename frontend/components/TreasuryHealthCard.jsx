'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';

function scoreColor(score) {
  if (score >= 85) return 'text-good';
  if (score >= 70) return 'text-brand';
  if (score >= 50) return 'text-warn';
  return 'text-bad';
}

function ringColor(score) {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#00d9ff';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function TreasuryHealthCard({ refreshKey = 0 }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.treasuryHealth().then(setData).catch(() => {});
  }, [refreshKey]);

  if (!data?.score && data?.score !== 0) {
    return (
      <div className="card p-5 animate-pulse h-36" />
    );
  }

  const pct = data.score;
  const color = ringColor(pct);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${pct} 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center number text-xl font-bold ${scoreColor(pct)}`}>
            {pct}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon.Sparkle className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-ink-100">Treasury Health</h2>
            <span className={`pill text-[10px] ${scoreColor(pct)} bg-white/5`}>{data.grade}</span>
          </div>
          <p className="text-xs text-ink-300 leading-relaxed mb-2">{data.tip}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-ink-500">
            <span>Savings {data.savings_pct}%</span>
            <span>·</span>
            <span>{data.active_rules} rules</span>
            {data.pending_approvals > 0 && (
              <>
                <span>·</span>
                <span className="text-warn">{data.pending_approvals} pending</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
