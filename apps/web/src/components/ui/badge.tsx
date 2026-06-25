import * as React from 'react';
import { cn } from '@/lib/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
}

const variantClass: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-primary/10 text-primary',
  secondary: 'bg-muted text-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  outline: 'border border-border text-foreground',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
