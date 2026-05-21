import type { ShiftStatus } from '@/types/shift';
import { cn } from '@/lib/cn';

/**
 * Бейдж статуса вахты.
 * UX-правило: цвет ВСЕГДА дублируется текстом и иконкой (доступность,
 * полевые условия — солнце, дальтоники).
 */

interface Variant {
  label: string;
  icon: string;
  classes: string;
}

const VARIANTS: Record<ShiftStatus, Variant> = {
  free: {
    label: 'Свободен',
    icon: '○',
    classes: 'bg-ink-100 text-ink-700 border-ink-200',
  },
  pending_acceptance: {
    label: 'Ждёт приёмки',
    icon: '◐',
    classes: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  active: {
    label: 'В работе',
    icon: '●',
    classes: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  issue_idle: {
    label: 'Простой',
    icon: '!',
    classes: 'bg-red-50 text-red-900 border-red-300',
  },
  issue_repair: {
    label: 'Ремонт',
    icon: '⚒',
    classes: 'bg-red-50 text-red-900 border-red-300',
  },
  pending_verification: {
    label: 'На проверке',
    icon: '⏳',
    classes: 'bg-sky-50 text-sky-900 border-sky-300',
  },
  verified: {
    label: 'Закрыта',
    icon: '✓',
    classes: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
};

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: ShiftStatus;
  size?: 'sm' | 'md';
}) {
  const v = VARIANTS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        v.classes,
      )}
    >
      <span aria-hidden className="font-bold">
        {v.icon}
      </span>
      <span>{v.label}</span>
    </span>
  );
}
