---
created: 2026-05-21
updated: 2026-05-21
---

# DEPLOY — фронт на GitHub Pages

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
