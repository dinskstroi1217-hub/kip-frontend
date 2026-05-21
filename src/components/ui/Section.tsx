import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions || description) && (
        <header className="flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-ink-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
