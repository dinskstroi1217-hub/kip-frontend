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

- [x] GitHub Actions workflow для сборки APK — `.github/workflows/build-apk.yml`
      запушен и РАБОТАЕТ (успешные прогоны: 778733b5, 31fbec95). Триггер: push в
      `feat/capacitor-android` (paths: src/android/public/package*.json/capacitor.config/сам workflow)
      или вручную (workflow_dispatch). Артефакт `kip-spectekh-debug-apk` → `app-debug.apk`.
- [ ] Keystore + подпись release (для распространяемого .apk; debug пока для теста)
- [x] `.env.production` с `VITE_API_BASE_URL=https://kip-api.dinskstroi1217.workers.dev`
      (вшивается в сборку; проверено — в JS-бандле APK адрес присутствует).
- [x] Хостинг `.apk` — на gh-pages: `api/app/kip-spetstekh-debug.apk` →
      https://kip.dkbikonstrykt.ru/api/app/kip-spetstekh-debug.apk (надёжный
      статический канал, без туннеля). Эту прямую ссылку раздавать водителям.
- [ ] **OTA live-update веб-слоя — ПРИОРИТЕТНО** (подтверждено 2026-06-15).
      Обновление приложения без переустановки APK. Решение: **Capgo**
      (`@capgo/capacitor-updater`), self-hosted на нашем сервере (бесплатно).
      Делать сразу после базовой CI-сборки APK. Только веб-слой; нативные
      изменения всё равно требуют нового APK (но in-place, без потери данных).
- [ ] Опц.: seed-снимок справочников в APK для офлайн-старта
- [ ] Иконка/сплэш приложения (сейчас дефолтные Capacitor)

## История изменений

- **2026-06-16** — **APK v2 собран и выложен.** Влит `origin/main` (14 фиксов:
  липкий вход localStorage, офлайн-движок, фото рапортов, досрочное закрытие вахты,
  поломки→МАКС, экран расчёта зарплаты) в `feat/capacitor-android` (merge `31fbec95`,
  0 конфликтов). CI `build-apk.yml` → run `27646579884` (success). Артефакт проверен
  адверсари: JS-бандл `index-r7utI0l3.js` совпал с локальной сборкой того же коммита,
  worker-URL и localStorage-вход присутствуют. Размер 9 718 188 Б, sha256 `04781d7b…`.
  Выложен на gh-pages → раздаётся с `kip.dkbikonstrykt.ru/api/app/kip-spetstekh-debug.apk`.
  ⚠️ Вход ВНУТРИ APK оживёт только после починки публичного туннеля (бэк ходит тем же путём, что и PWA).
- **2026-06-15** — Скаффолд: Capacitor 8.x + 8 плагинов, сгенерён `android/`-проект.
  Имя приложения кириллицей, права камеры/GPS в манифесте, splash-конфиг.
  Ветка `feat/capacitor-android` (worktree `kip-frontend-cap`), в `main` не смержено.
