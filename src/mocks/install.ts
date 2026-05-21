import { captureRealFetch, mockFetch } from './handlers';

/**
 * Включаем mock-режим: подменяем window.fetch.
 * Идемпотентно — повторный вызов ничего не делает.
 */

let installed = false;

export function installMocks(): void {
  if (installed) return;
  installed = true;
  captureRealFetch();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).fetch = mockFetch as typeof fetch;
  // Метка для DevTools / разработчика
  // eslint-disable-next-line no-console
  console.info(
    '%c[MOCK MODE]%c API-запросы перехватываются. Тестовые входы:\n' +
      '  Водитель: +79001111111 / PIN 1111\n' +
      '  Оператор: +79001000001 / PIN 1234',
    'background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-weight:600',
    'color:inherit',
  );
}

export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}
