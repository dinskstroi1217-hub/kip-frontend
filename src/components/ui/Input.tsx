import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, trailingSlot, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center min-h-tap rounded-lg border bg-white transition-colors',
          'focus-within:ring-2 focus-within:ring-brand-600 focus-within:border-brand-600',
          error ? 'border-red-500' : 'border-ink-300 hover:border-ink-400',
        )}
      >
        {leadingIcon && <span className="pl-3 text-ink-500">{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedById}
          className={cn(
            'min-h-tap w-full bg-transparent px-3 text-base text-ink-900 placeholder:text-ink-400 outline-none',
            'disabled:cursor-not-allowed disabled:text-ink-400',
            className,
          )}
          {...rest}
        />
        {trailingSlot && <span className="pr-2">{trailingSlot}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
