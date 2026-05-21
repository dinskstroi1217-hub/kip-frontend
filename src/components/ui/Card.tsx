import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  children,
  padded = true,
  interactive,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white shadow-card',
        padded && 'p-4 sm:p-5',
        interactive &&
          'cursor-pointer transition-shadow hover:shadow-card-hover focus-within:shadow-card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>{children}</div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-lg font-semibold text-ink-900', className)}>{children}</h3>;
}
