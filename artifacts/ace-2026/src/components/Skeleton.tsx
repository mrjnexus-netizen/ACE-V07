import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

export const Skeleton = ({ className, variant = 'rect' }: SkeletonProps) => {
  const baseClasses = 'animate-pulse bg-surface3';
  const variantClasses = {
    rect: 'rounded-md',
    circle: 'rounded-full',
    text: 'rounded h-4',
  };
  return <div className={cn(baseClasses, variantClasses[variant], className)} />;
};
