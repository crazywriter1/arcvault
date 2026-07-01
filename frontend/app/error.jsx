'use client';

// Route-level error boundary. Next.js renders this whenever a child component throws.

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error:', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-bad/15 text-bad flex items-center justify-center mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-ink-100 mb-2">Something went wrong</h1>
        <p className="text-sm text-ink-400 mb-1">
          The dashboard hit an unexpected error.
        </p>
        {error?.message && (
          <p className="text-[11px] font-mono text-ink-500 mb-6 break-words">
            {error.message}
          </p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}
            className="btn-ghost"
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
