'use client';

// Reusable shimmer placeholders. Sized via Tailwind classes by the caller.

export function Skeleton({ className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-white/[0.04] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-7 w-24 mb-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function WalletCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-16 mb-1.5" />
      <Skeleton className="h-7 w-32 mb-4" />
      <ul className="space-y-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </ul>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Skeleton className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
