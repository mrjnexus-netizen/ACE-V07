import { InputHTMLAttributes, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, checked, className, onChange, ...props }, ref) => {
    return (
      <label className={cn('flex items-center gap-3 cursor-pointer', className)}>
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            ref={ref}
            checked={checked}
            onChange={onChange}
            {...props}
          />
          <div
            className={cn(
              'block w-10 h-6 rounded-full transition-colors',
              checked ? 'bg-accent' : 'bg-surface3'
            )}
          />
          <motion.div
            className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md"
            animate={{ x: checked ? 18 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
        {label && <span className="text-sm text-text-color">{label}</span>}
      </label>
    );
  }
);
Switch.displayName = 'Switch';
