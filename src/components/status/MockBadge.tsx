import { isMockMode } from '@/mocks/install';

/**
 * Видимый маркер mock-режима. Без него легко забыть, что данные не настоящие.
 */
export function MockBadge() {
  if (!isMockMode()) return null;
  return (
    <span
      title="API-запросы обслуживаются локальными моками — данные тестовые"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900"
    >
      <span aria-hidden>●</span> mock
    </span>
  );
}
