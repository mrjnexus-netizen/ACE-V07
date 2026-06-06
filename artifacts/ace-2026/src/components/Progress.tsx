import { cn } from '../lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  label?: string;
  indeterminate?: boolean;
}

export const Progress = ({ value, max = 100, className, label, indeterminate }: ProgressProps) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex justify-between text-xs text-text-muted">
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-surface3 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300',
            indeterminate ? 'w-1/2 animate-pulse bg-accent/50' : 'bg-accent'
          )}
          style={{ width: indeterminate ? '50%' : percent + '%' }}
        />
      </div>
    </div>
  );
};