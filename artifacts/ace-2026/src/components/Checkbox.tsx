import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/utils';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate, className, ...props }, ref) => {
    return (
      <label className={cn('flex items-center gap-2 cursor-pointer', className)}>
        <input
          type="checkbox"
          ref={ref}
          className="w-4 h-4 rounded border-border bg-surface3 accent-accent focus:ring-2 focus:ring-accent/50"
          {...props}
        />
        {label && <span className="text-sm text-text-color">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';
