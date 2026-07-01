'use client';

// Tiny toast system — context provider + portal-less stack at the top right.
// Usage: const { toast } = useToast(); toast.success('Done'); toast.error('Failed');

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Icon } from './Icons';

const ToastCtx = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((variant, message, opts = {}) => {
    const id = nextId++;
    const ttl = opts.ttl ?? (variant === 'error' ? 6000 : 3500);
    setItems(prev => [...prev, { id, variant, message }]);
    if (ttl > 0) setTimeout(() => remove(id), ttl);
    return id;
  }, [remove]);

  const toast = {
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    warn: (m, o) => push('warn', m, o),
    dismiss: remove,
  };

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {items.map(t => (
          <ToastItem key={t.id} {...t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ variant, message, onClose }) {
  const styles = {
    success: { bg: 'bg-good/10', text: 'text-good', border: 'border-good/30', Icon: Icon.Check },
    error:   { bg: 'bg-bad/10',  text: 'text-bad',  border: 'border-bad/30',  Icon: Icon.X },
    info:    { bg: 'bg-brand/10', text: 'text-brand', border: 'border-brand/30', Icon: Icon.Sparkle ?? Icon.Bell },
    warn:    { bg: 'bg-warn/10', text: 'text-warn', border: 'border-warn/30', Icon: Icon.Bell },
  }[variant] ?? { bg: 'bg-white/5', text: 'text-ink-200', border: 'border-white/10', Icon: Icon.Bell };

  return (
    <div
      className={`pointer-events-auto min-w-[260px] max-w-sm flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border ${styles.bg} ${styles.border} backdrop-blur-md shadow-lg animate-fade-up`}
    >
      <styles.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${styles.text}`} />
      <div className="flex-1 text-xs text-ink-100 leading-relaxed break-words">{message}</div>
      <button
        onClick={onClose}
        className="text-ink-400 hover:text-ink-100 transition shrink-0"
        aria-label="Dismiss"
      >
        <Icon.X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export const useToast = () => useContext(ToastCtx) ?? { toast: { success(){}, error(){}, info(){}, warn(){}, dismiss(){} } };
