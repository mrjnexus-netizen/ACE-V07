import { ReactNode } from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-accent/10 text-accent border-accent/30',
  success: 'bg-green-500/10 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export const Badge = ({ children, variant = 'default', className }: BadgeProps) => {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-full border', variantClasses[variant], className)}>
      {children}
    </span>
  );
};
