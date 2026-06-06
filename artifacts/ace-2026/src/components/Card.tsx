import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

type CardVariant = 'default' | 'glass' | 'elevated';

interface CardProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  image?: string;
  footer?: ReactNode;
  variant?: CardVariant;
  onClick?: () => void;
  className?: string;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-surface2 border border-border',
  glass: 'bg-surface2/40 backdrop-blur-md border border-border/50',
  elevated: 'bg-surface3 shadow-lg',
};

export const Card = ({
  children,
  title,
  description,
  image,
  footer,
  variant = 'default',
  onClick,
  className,
}: CardProps) => {
  const isInteractive = !!onClick;
  return (
    <motion.div
      whileHover={isInteractive ? { scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' } : {}}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-xl overflow-hidden',
        variantClasses[variant],
        isInteractive && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {image && (
        <div className="relative w-full h-48 overflow-hidden">
          <img src={image} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        {title && <div className="font-display text-lg mb-1">{title}</div>}
        {description && <div className="text-sm text-text-muted mb-3">{description}</div>}
        {children && <div className="mb-3">{children}</div>}
        {footer && <div className="mt-2 pt-2 border-t border-border">{footer}</div>}
      </div>
    </motion.div>
  );
};
