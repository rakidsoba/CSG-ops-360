import React from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      <Skeleton className="skeleton-title" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div style={{ padding: 16, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-text" style={{ width: '80%' }} />
      <Skeleton className="skeleton-text" style={{ width: '60%' }} />
    </div>
  );
}
