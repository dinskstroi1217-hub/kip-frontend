import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Шторка снизу — стандартный мобильный паттерн для quick actions.
 *
 * Принципы:
 *   - backdrop затемнён, клик закрывает.
 *   - Esc закрывает.
 *   - body scroll lock пока открыто.
 *   - Sticky-кнопка submit внизу шторки (нижняя CTA-зона = одна рука).
 *   - Контент scrollable.
 */

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Не закрывать по клику на backdrop (для форм с непрерывным вводом). */
  preventBackdropClose?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  preventBackdropClose,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={preventBackdropClose ? undefined : onClose}
      />
      <div
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl',
          'sm:max-w-md sm:rounded-2xl',
          'animate-[slideUp_180ms_cubic-bezier(0.2,0.8,0.2,1)]',
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div>
            <h2 id="sheet-title" className="text-lg font-semibold text-ink-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-3">{footer}</div>}
      </div>

      {/* Inline keyframes — выносить в Tailwind config ради одной анимации избыточно */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
