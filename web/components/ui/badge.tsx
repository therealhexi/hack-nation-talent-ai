import * as React from 'react';

export function Badge({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-sm)] bg-[--color-muted] px-2 py-0.5 text-xs text-[--color-foreground] ${className}`}>
      {children}
    </span>
  );
} 