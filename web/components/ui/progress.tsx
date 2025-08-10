import * as React from 'react';

export function Progress({ value = 0, className = '' }: { value?: number; className?: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full rounded-[var(--radius-sm)] bg-[--color-muted] ${className}`}>
      <div className="h-2 rounded-[var(--radius-sm)] bg-[--color-accent] transition-[width] duration-300" style={{ width: `${width}%` }} />
    </div>
  );
} 