import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from '@/lib/cn';

/**
 * Многошаговый wizard.
 *
 * Не управляет своим состоянием — родитель решает что на каком шаге. Это
 * упрощает: на каждом экране (page) свой набор шагов и логика валидации.
 *
 * UX-нюансы:
 *   - Прогресс точками сверху + название текущего шага.
 *   - Внизу — Назад / Далее. На первом шаге «Назад» уводит на пред. экран.
 *   - На последнем шаге кнопка с кастомным лейблом (например, "Активировать").
 *   - Высота кнопок 56px (CTA-zone) — большие тапы.
 */

export interface WizardStep {
  title: string;
  /** Можно ли двигаться с этого шага дальше. */
  canProceed: boolean;
  content: ReactNode;
}

interface WizardProps {
  steps: WizardStep[];
  current: number;
  onBack: () => void;
  onNext: () => void;
  /** Лейбл кнопки на последнем шаге. По умолчанию «Готово». */
  submitLabel?: string;
  submitting?: boolean;
}

export function Wizard({
  steps,
  current,
  onBack,
  onNext,
  submitLabel = 'Готово',
  submitting,
}: WizardProps) {
  const total = steps.length;
  const step = steps[current];
  if (!step) return null;
  const isLast = current === total - 1;

  return (
    <div className="flex h-full flex-col">
      <Stepper total={total} current={current} />
      <h2 className="mb-4 text-xl font-bold text-ink-900">{step.title}</h2>
      <div className="flex-1 pb-4">{step.content}</div>
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-3 border-t border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur">
        <Button variant="secondary" size="xl" onClick={onBack} disabled={submitting} type="button">
          {current === 0 ? 'Отмена' : 'Назад'}
        </Button>
        <Button
          size="xl"
          onClick={onNext}
          disabled={!step.canProceed || submitting}
          loading={submitting && isLast}
          type="button"
        >
          {isLast ? submitLabel : 'Далее'}
        </Button>
      </div>
    </div>
  );
}

function Stepper({ total, current }: { total: number; current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label="Прогресс">
      {Array.from({ length: total }).map((_, i) => (
        <li
          key={i}
          aria-current={i === current ? 'step' : undefined}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            i < current && 'bg-emerald-500',
            i === current && 'bg-brand-700',
            i > current && 'bg-ink-200',
          )}
        />
      ))}
    </ol>
  );
}
