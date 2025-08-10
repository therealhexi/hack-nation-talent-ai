import * as React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-[var(--radius-sm)] ${className}`} />;
} 