# Сборка Android APK (Capacitor) — КИП Спецтехника

Парный .md к Android-сборке driver-приложения. Новейшие записи в «Истории» — сверху.

## Назначение

Обёртка существующей driver-PWA в нативное Android-приложение через **Capacitor**.
Зачем: водителю — прямая ссылка на `.apk`, ставит как обычное приложение (иконка,
без браузера), UI зашит внутрь → работает офлайн с первого запуска; нативные
камера/GPS/файлы надёжнее веб-API в поле.

- `appId`: `ru.dkbikonstrykt.kip`
- `appName` (отображаемое): «КИП Спецтехника» (`android/.../res/values/strings.xml`)
- Веб-код тот же, что и PWA — отдельной кодовой базы НЕТ.

## Плагины (нативные возможности)

`@capacitor/` — `camera`, `geolocation`, `filesystem`, `network`, `app`,
`preferences`, `splash-screen`, `status-bar`.

Права в `AndroidManifest.xml`: `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`,
`READ_MEDIA_IMAGES`, `ACCESS_COARSE/FINE_LOCATION`.

## Входы / выходы

**Входы (build-time):**
- `VITE_API_BASE_URL` — **ОБЯЗАТЕЛЬНО для APK** абсолютный адрес бэка
  (напр. `https://api.kip.dkbikonstrykt.ru`). Веб-ассеты в APK работают с
  origin `https://localhost`, поэтому относительные `/api/...` НЕ сработают.
  Для PWA остаётся пустым. ⚠️ Точный URL подтвердить у диспетчер-сессии (владелец бэка/инфры).
- Keystore для подписи release (для распространяемого `.apk`).

**Выходы:**
- `android/app/build/outputs/apk/debug/app-debug.apk` — отладочный
- `android/app/build/outputs/apk/release/app-release.apk` — подписанный, для раздачи

## Как собирать

Локально на машине Дениса Android-тулинга НЕТ (ни JDK, ни Android SDK, ни Gradle) —
**собирать в CI** (GitHub Actions с Android SDK). Артефакт релиза = прямая ссылка
на скачивание для водителей.

Команды (выполняет CI или машина с Android SDK+JDK 17):
```bash
npm ci
VITE_API_BASE_URL=https://api.kip.dkbikonstrykt.ru npm run build
npx cap sync android                 # копирует свежий dist + плагины в android/
cd android && ./gradlew assembleRelease   # → app-release.apk (нужна подпись)
```

Зависимости: Node 22+, JDK 17, Android SDK (compileSdk из `android/variables.gradle`),
Capacitor CLI (в devDeps).

## Раздача

Прямая ссылка на `.apk` (без сторов). Водитель: открыть ссылку на телефоне →
скачать → разрешить «установка из неизвестных источников» (один раз) → установить.

## Не сделано (следующие шаги)

- [~] GitHub Actions workflow для сборки APK — файл написан локально
      (`.github/workflows/build-apk.yml`, собирает debug-APK → артефакт
      `kip-spectekh-debug-apk`), НО НЕ запушен: токен GitHub без `workflow`-scope
      отклоняет push файлов workflow. Добавить одним из способов:
      (а) включить scope `workflow` у PAT и запушить; либо
      (б) создать файл через github.com → Actions → New workflow → вставить YAML.
- [ ] Keystore + подпись release (для распространяемого .apk; debug пока для теста)
- [ ] `.env.production` / CI-переменная с подтверждённым `VITE_API_BASE_URL`
- [ ] Хостинг `.apk` + страница/ссылка на скачивание (шаг 5)
- [ ] **OTA live-update веб-слоя — ПРИОРИТЕТНО** (подтверждено 2026-06-15).
      Обновление приложения без переустановки APK. Решение: **Capgo**
      (`@capgo/capacitor-updater`), self-hosted на нашем сервере (бесплатно).
      Делать сразу после базовой CI-сборки APK. Только веб-слой; нативные
      изменения всё равно требуют нового APK (но in-place, без потери данных).
- [ ] Опц.: seed-снимок справочников в APK для офлайн-старта
- [ ] Иконка/сплэш приложения (сейчас дефолтные Capacitor)

## История изменений

- **2026-06-15** — Скаффолд: Capacitor 8.x + 8 плагинов, сгенерён `android/`-проект.
  Имя приложения кириллицей, права камеры/GPS в манифесте, splash-конфиг.
  Ветка `feat/capacitor-android` (worktree `kip-frontend-cap`), в `main` не смержено.
