import { ImgHTMLAttributes, useState } from 'react';
import { cn } from '../lib/utils';

interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
}

export const Avatar = ({ src, alt, fallback = '?', size = 'md', online, className, ...props }: AvatarProps) => {
  const [error, setError] = useState(false);
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };
  const showFallback = !src || error;
  return (
    <div className={cn('relative inline-block', sizeClasses[size], className)}>
      {showFallback ? (
        <div className="w-full h-full rounded-full bg-surface3 flex items-center justify-center text-text-muted font-mono">
          {fallback.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="w-full h-full rounded-full object-cover"
          onError={() => setError(true)}
          {...props}
        />
      )}
      {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-surface" />}
    </div>
  );
};
