import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/Button';

/**
 * Подпись пальцем на canvas.
 *
 * Использует библиотеку `signature_pad` (stylus/touch с velocity-smoothing,
 * стандарт индустрии — HelloSign, DocuSign Mobile, Fleetio).
 *
 * Props:
 *   - onChange: вызывается, когда пользователь дорисовывает / стирает.
 *               isEmpty = подпись отсутствует.
 *   - height: высота canvas (по умолчанию 200px, в landscape — 160).
 *
 * Imperative ref: `getDataUrl()` возвращает base64 PNG.
 */

export interface SignaturePadHandle {
  getDataUrl(): string | null;
  clear(): void;
  isEmpty(): boolean;
}

interface SignaturePadProps {
  onChange?: (isEmpty: boolean) => void;
  height?: number;
  label?: string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, height = 200, label = 'Распишитесь пальцем' },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(15,23,42)', // ink-900
      minWidth: 1,
      maxWidth: 2.5,
      throttle: 8,
    });

    const handleChange = () => {
      const isEmpty = pad.isEmpty();
      setEmpty(isEmpty);
      onChange?.(isEmpty);
    };

    pad.addEventListener('endStroke', handleChange);
    pad.addEventListener('afterUpdateStroke', handleChange);

    padRef.current = pad;
    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      pad.off();
      padRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () => (padRef.current?.isEmpty() ? null : (padRef.current?.toDataURL() ?? null)),
      clear: () => {
        padRef.current?.clear();
        setEmpty(true);
        onChange?.(true);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
    }),
    [onChange],
  );

  function handleClear() {
    padRef.current?.clear();
    setEmpty(true);
    onChange?.(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-700">{label}</p>
        <Button variant="ghost" size="md" onClick={handleClear} disabled={empty} type="button">
          Очистить
        </Button>
      </div>
      <div
        className="overflow-hidden rounded-xl border-2 border-dashed border-ink-300 bg-white"
        style={{ height }}
      >
        <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label={label} />
      </div>
      {empty && (
        <p className="text-xs text-ink-500">
          Подпись обязательна. Без подписи акт не считается оформленным.
        </p>
      )}
    </div>
  );
});
