import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useInstallPrompt — установка PWA как настоящего Android-приложения (WebAPK).
 *
 * Почему хук вообще нужен: современный Chrome на Android НЕ показывает
 * авто-баннер установки. Он шлёт событие `beforeinstallprompt`, но если
 * приложение его не ловит и не вызывает `.prompt()` — пользователь видит
 * только сайт (максимум «Добавить на главный экран» = ярлык-закладка).
 *
 * Что делает хук:
 *   - ловит `beforeinstallprompt`, гасит дефолт, сохраняет событие;
 *   - по запросу вызывает `prompt()` внутри пользовательского жеста
 *     (иначе браузер отклонит) и ждёт выбор;
 *   - слушает `appinstalled` — прячет кнопку после установки;
 *   - детектит уже-установленный режим (display-mode: standalone) — чтобы
 *     не предлагать установку внутри уже установленного приложения;
 *   - детектит iOS Safari (там `beforeinstallprompt` не существует вовсе) —
 *     для него UI покажет текстовую инструкцию «Поделиться → На экран Домой».
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ маскируется под Mac — ловим по touch.
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

export interface UseInstallPrompt {
  /** Пришло beforeinstallprompt — можно показать кнопку установки (Android/Chromium). */
  canInstall: boolean;
  /** Приложение уже запущено как установленное PWA. */
  isStandalone: boolean;
  /** iOS Safari — программной установки нет, нужна текстовая инструкция. */
  isIOS: boolean;
  /** Установка завершилась успешно в этой сессии. */
  installed: boolean;
  /** Показать системный диалог установки. Возвращает выбор пользователя. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstallPrompt(): UseInstallPrompt {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isStandalone] = useState(detectStandalone);
  const [isIOS] = useState(detectIOS);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // не даём Chrome показать свой mini-infobar
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const ev = deferred.current;
    if (!ev) return 'unavailable' as const;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    // Повторно вызвать prompt() на том же объекте нельзя — сбрасываем.
    deferred.current = null;
    setCanInstall(false);
    return outcome;
  }, []);

  return { canInstall, isStandalone, isIOS, installed, promptInstall };
}
