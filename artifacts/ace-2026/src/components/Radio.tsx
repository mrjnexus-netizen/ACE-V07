import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/utils';

interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label className={cn('flex items-center gap-2 cursor-pointer', className)}>
        <input
          type="radio"
          ref={ref}
          className="w-4 h-4 border-border bg-surface3 accent-accent focus:ring-2 focus:ring-accent/50"
          {...props}
        />
        {label && <span className="text-sm text-text-color">{label}</span>}
      </label>
    );
  }
);
Radio.displayName = 'Radio';
