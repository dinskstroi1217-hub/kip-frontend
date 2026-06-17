---
created: 2026-05-21
updated: 2026-06-11
---

# DEPLOY — фронт на GitHub Pages

## ⚡ Актуальный процесс (ручной, через gh-pages worktree)

CI-workflow удалён (PAT без workflow scope) — деплой руками, ~2 минуты:

```bash
cd kip-frontend
npm run typecheck                      # обязательно перед деплоем
git add -A && git commit -m "..."      # коммит в main
git push origin main
npm run build                          # читает .env.production (base=/, CF Worker URL)
cp dist/index.html dist/404.html       # SPA-fallback (vite его НЕ создаёт)

cd ../kip-frontend-ghpages             # worktree ветки gh-pages
git rm -rq .                           # очистить старую сборку
cp -r ../kip-frontend/dist/* .
echo "kip.dkbikonstrykt.ru" > CNAME    # ⚠️ CNAME обязателен — без него отвалится домен
touch .nojekyll                        # ⚠️ тоже удаляется при git rm
mkdir -p api/app && cp /c/Users/dinsk/kip-apk/v2/app-debug.apk api/app/kip-spetstekh-debug.apk  # ⚠️ debug-APK v2: см. ниже
git add -A && git commit -m "deploy: <что>" && git push origin gh-pages
```

⚠️ **APK на gh-pages — путь именно `/api/app/`, НЕ `/app/`!**
Установленный PWA имеет service worker со scope `/`, который перехватывает
навигацию и отдаёт оболочку приложения (→ SPA-404) для любого пути, КРОМЕ
`navigateFallbackDenylist: [/^\/api\//]`. Поэтому APK под `/app/` на телефоне
с установленным PWA даёт 404, а под `/api/app/` (в denylist) — скачивается.
- **Рабочая ссылка:** `https://kip.dkbikonstrykt.ru/api/app/kip-spetstekh-debug.apk`
- `git rm -rq .` при деплое стирает `api/app/` — строка перекопирования выше обязательна.
- Обновить APK — заменить `C:\Users\dinsk\kip-apk\v2\app-debug.apk` (актуальный v2) и передеплоить
  (или докинуть в `kip-frontend-ghpages/api/app/` + push).
- workers.dev-копия (`/app/` через бэк) не годится для телефона: Cloudflare режется в моб.РФ.

Проверка: через ~1 мин `curl -s https://kip.dkbikonstrykt.ru/ | grep assets/index-`
— хэш бандла должен совпасть с dist/index.html.

**Прод:** https://kip.dkbikonstrykt.ru/ (CNAME → GH Pages, base=/).
**API:** https://kip-api.dinskstroi1217.workers.dev (CF Worker, стабильный).

## История изменений
- **2026-06-17 (2)** — деплой: главный экран водителя action-first «4 действия» + нижнее
  меню (Главная/Закрытые) + история `/driver/history` (main `a69c29e9`, gh-pages `c14d3327`,
  bundle `index-AxcS5LA7`). Заодно восстановлен APK v2 (sha04781d7) на gh-pages — прошлый
  деплой мог затереть; путь APK в этом файле уже исправлен на `kip-apk/v2/app-debug.apk`.
- **2026-06-17** — деплой «Моя оплата» водителю + секция «Закрытые вахты» на дашборде
  (main `8cc5ca1c`, gh-pages `5c1d42b0`, bundle `index-DW56WU4v`). Перед деплоем — полный
  E2E на проде (вахта→день→расход→оператор-расчёт 6600₽→виден водителю), данные убраны.
  ⚠️ `git rm -rq .` стёр `api/app/` — APK v2 перекопирован из `kip-apk/v2/app-debug.apk`
  (sha04781d7 сохранён). Прод отдаёт новый бандл — проверено curl'ом.
- **2026-06-11** — деплой E2E-фиксов + ГЛОНАСС-сверки (gh-pages `88dce72d`,
  main `6c8ef33f`). Задокументирован актуальный ручной процесс; ловушки:
  CNAME и .nojekyll удаляются при `git rm -rq .`, 404.html нужно создавать руками.
- **2026-05-21** — создан (описывал CI через GitHub Actions — устарело, см. ниже).

---

## Что готово
- Vite билдит с `base = process.env.VITE_BASE_PATH` (на проде = `/kip-frontend/`).
- PWA manifest, иконки, sw.js — все пути с префиксом базы.
- React-router работает под `BrowserRouter basename={import.meta.env.BASE_URL}`.
- SPA-fallback: GitHub Actions копирует `dist/index.html` → `dist/404.html`,
  чтобы при F5 на `/kip-frontend/driver` GH Pages отдал тот же файл.
- Workflow `.github/workflows/deploy-gh-pages.yml` деплоит на каждый push в `main`.
- Локальный git-repo инициализирован, baseline-коммит `ed83e6f` готов.

## Что нужно от тебя — один раз

### 1. Создать репо на GitHub
```bash
# Через gh CLI (если установлен)
gh repo create dinskstroi1217-hub/kip-frontend --public --source=. --remote=origin --push

# Или вручную:
#   1) https://github.com/new — owner: dinskstroi1217-hub, name: kip-frontend, Public
#   2) git remote add origin git@github.com:dinskstroi1217-hub/kip-frontend.git
#   3) git branch -M main
#   4) git push -u origin main
```

### 2. Включить Pages
1. https://github.com/dinskstroi1217-hub/kip-frontend/settings/pages
2. **Build and deployment** → **Source**: `GitHub Actions`
3. Сохранить.

### 3. Дождаться первого деплоя
- Открыть https://github.com/dinskstroi1217-hub/kip-frontend/actions
- Workflow `Deploy frontend → GitHub Pages` стартанёт автоматически после push.
- На выходе будет URL вида `https://dinskstroi1217-hub.github.io/kip-frontend/`.

### 4. Open & test
- Зайти на `https://dinskstroi1217-hub.github.io/kip-frontend/`.
- Логин: `+79001111111` / `1111` (driver) или `+79001000001` / `1234` (operator).
- В DevTools → Network проверить что запросы идут на
  `https://concept-mechanics-influences-extract.trycloudflare.com` (или
  актуальный URL бэка) без CORS-ошибок.

## Если бэк-URL поменялся
В `.env.production`:
```
VITE_API_BASE_URL=https://<новый-tunnel-url>
```
Сделать commit + push → workflow перебилдит.

## Если репо называется иначе
- В `.env.production` → `VITE_BASE_PATH=/<имя-репо>/` (workflow сам подставит
  `/${{ github.event.repository.name }}/`, но локально для тестов править руками).

## Кастомный домен (опционально)
Если потом купишь домен и захочешь `kip.<домен>`:
1. В Cloudflare/DNS: CNAME `kip` → `dinskstroi1217-hub.github.io`.
2. В репо создать `public/CNAME` с содержимым `kip.<домен>`.
3. В Settings → Pages → Custom domain — указать тот же домен.
4. В `.env.production` → `VITE_BASE_PATH=/` (потому что теперь корень).
