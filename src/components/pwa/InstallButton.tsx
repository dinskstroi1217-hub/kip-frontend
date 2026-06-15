import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

/**
 * Кнопка/подсказка установки PWA. Встраивается на экран входа (LoginPage)
 * до авторизации — это единственный публичный экран.
 *
 * Логика отображения:
 *   - уже установлено (standalone) → ничего не рисуем;
 *   - Android/Chromium поймал beforeinstallprompt → кнопка «Установить
 *     приложение» (по клику системный диалог);
 *   - iOS Safari → текстовая инструкция (там программной установки нет);
 *   - Chromium, но событие ещё не пришло → тихая подсказка про меню ⋮
 *     (fallback: beforeinstallprompt может задержаться или быть подавлен).
 */
export function InstallButton() {
  const { canInstall, isStandalone, isIOS, installed, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [dismissedHint, setDismissedHint] = useState(false);

  // Внутри установленного приложения или сразу после установки — молчим.
  if (isStandalone || installed) return null;

  // Android / десктоп Chromium: пришло событие — показываем настоящую кнопку.
  if (canInstall) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="lg"
        fullWidth
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await promptInstall();
          } finally {
            setBusy(false);
          }
        }}
      >
        📲 Установить приложение
      </Button>
    );
  }

  // iOS Safari: программной установки нет — короткая инструкция.
  if (isIOS) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-sm text-ink-700">
        Чтобы установить приложение: нажмите <b>«Поделиться»</b> ⬆️ → <b>«На экран
        „Домой“»</b>.
      </div>
    );
  }

  // Fallback (Chromium без события): тихая подсказка про меню браузера.
  if (dismissedHint) return null;
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
      <span>
        Установить приложение: меню браузера <b>⋮</b> → <b>«Установить приложение»</b>.
      </span>
      <button
        type="button"
        onClick={() => setDismissedHint(true)}
        className="shrink-0 text-ink-400 hover:text-ink-700"
        aria-label="Скрыть подсказку"
      >
        ✕
      </button>
    </div>
  );
}
