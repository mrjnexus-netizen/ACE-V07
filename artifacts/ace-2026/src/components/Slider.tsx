import { useRef, InputHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

interface SliderProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Slider = ({ label, className, ...props }: SliderProps) => {
  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="block text-xs font-mono text-text-muted">{label}</label>}
      <input
        type="range"
        className="w-full h-2 bg-surface3 rounded-lg appearance-none cursor-pointer accent-accent"
        {...props}
      />
    </div>
  );
};
