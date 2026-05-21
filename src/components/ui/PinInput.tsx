import {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Длина PIN (по умолчанию 4). */
  length?: number;
  /** Автофокус на первой ячейке. */
  autoFocus?: boolean;
  error?: boolean;
  disabled?: boolean;
  /** Вызывается, когда PIN полностью введён. */
  onComplete?: (value: string) => void;
  'aria-label'?: string;
}

/**
 * PIN-инпут на N цифр.
 *
 * UX:
 *   - numeric inputmode → виртуальная клавиатура только цифры (в т.ч. iOS)
 *   - autoComplete="one-time-code" → подхват SMS-кода на iOS/Android если будет
 *   - paste 4 цифр → разносит по ячейкам
 *   - Backspace на пустой ячейке возвращает фокус назад
 *   - tap-targets 56×56 (комфортно для перчаток)
 */
export function PinInput({
  value,
  onChange,
  length = 4,
  autoFocus,
  error,
  disabled,
  onComplete,
  'aria-label': ariaLabel = 'PIN-код',
}: PinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
    // intentional — onComplete только при достижении длины
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  const setDigit = useCallback(
    (index: number, digit: string) => {
      const cleaned = digit.replace(/\D/g, '').slice(0, 1);
      const arr = value.padEnd(length, ' ').split('');
      arr[index] = cleaned || ' ';
      const next = arr.join('').replace(/\s/g, '');
      onChange(next.slice(0, length));
    },
    [length, onChange, value],
  );

  const handleChange = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      setDigit(i, '');
      return;
    }
    // Если пришла строка длиннее 1 (autofill / paste), распределим
    if (v.length > 1) {
      const cleaned = v.replace(/\D/g, '').slice(0, length);
      onChange(cleaned);
      const idx = Math.min(cleaned.length, length - 1);
      refs.current[idx]?.focus();
      return;
    }
    setDigit(i, v);
    if (/\d/.test(v) && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!value[i] && i > 0) {
        refs.current[i - 1]?.focus();
        setDigit(i - 1, '');
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ''}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          onPaste={handlePaste}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Цифра ${i + 1} из ${length}`}
          disabled={disabled}
          className={cn(
            'h-14 w-12 sm:h-16 sm:w-14 rounded-xl border-2 bg-white text-center text-2xl font-semibold text-ink-900 outline-none',
            'transition-colors',
            error
              ? 'border-red-500'
              : 'border-ink-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-600',
            disabled && 'bg-ink-100 text-ink-400',
          )}
        />
      ))}
    </div>
  );
}
