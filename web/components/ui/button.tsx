import * as React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
};

const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-ring] disabled:opacity-50 disabled:pointer-events-none';

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[--color-accent] text-[--color-accent-foreground] border border-[--color-border] shadow-sm hover:opacity-95',
  secondary: 'bg-[--color-primary] text-[--color-foreground] border border-[--color-border] shadow-sm hover:opacity-95',
  subtle: 'bg-white border border-[--color-border] text-[--color-foreground] shadow-sm hover:bg-[--color-muted]'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button'; 