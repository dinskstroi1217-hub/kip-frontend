import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

// ── Самовосстановление при «застрявшем» кэше после деплоя ───────────────────
// Приложение разбито на чанки (lazy). После обновления на сервере старые имена
// чанков удаляются. Если у сотрудника закэширован старый каркас, переход в
// раздел (напр. диспетчера) пытается подгрузить старый чанк → 404 → пустой
// экран. Ловим это и один раз перезагружаем страницу — она получает свежий
// index с новыми именами чанков. Счётчик не даёт зациклиться, если деплой
// реально битый (после 2 попыток — отдаём ошибку как есть).
function reloadForStaleChunk(reason: string): void {
  const KEY = 'kip:chunk-reloads';
  const n = Number(sessionStorage.getItem(KEY) || '0');
  if (n >= 2) {
    console.error('[kip] чанк не загрузился после перезагрузок:', reason);
    return;
  }
  sessionStorage.setItem(KEY, String(n + 1));
  console.warn('[kip] устаревший чанк → перезагрузка:', reason);
  window.location.reload();
}
// Vite бросает это событие, когда не смог подгрузить модуль-чанк.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadForStaleChunk('vite:preloadError');
});
// Подстраховка: прямой import() может отклониться как unhandledrejection.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason && e.reason.message) || e.reason || '');
  if (/dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically/i.test(msg)) {
    reloadForStaleChunk('unhandledrejection');
  }
});

// БЕЗ top-level await: TLA ломает single-file сборку (vite-plugin-singlefile) —
// инлайн-модуль молча не исполняется. Оборачиваем в async boot().
async function boot(): Promise<void> {
  // Mock-режим включается до первого рендера, чтобы window.fetch уже был
  // перехвачен к моменту, когда LoginPage запустит useAsync(driversApi.list).
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { installMocks } = await import('./mocks/install');
    installMocks();
  }
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Root element #root not found in index.html');
  }
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
