---
name: deploy-gh-pages
created: 2026-05-21
updated: 2026-05-21
---

# deploy-gh-pages.yml

## Назначение
GitHub Actions workflow для авто-деплоя фронта **КИП Спецтехника** на
**GitHub Pages**. Запускается на каждый push в `main` (и вручную через
`workflow_dispatch`).

## Что делает (по шагам)
1. Checkout репозитория.
2. Setup Node 22 + npm-cache.
3. `npm ci` — установка зависимостей по lockfile.
4. `npm run typecheck` — TypeScript-проверка.
5. `npm run build` с `VITE_BASE_PATH=/<repo-name>/` — vite билдит в `dist/`
   c правильным базовым путём.
6. `cp dist/index.html dist/404.html` — SPA-fallback: при F5 на любой
   non-root странице GH Pages отдаст `404.html`, который перерисуется в
   правильный экран через react-router.
7. Sanity-check артефактов (index.html, 404.html, sw.js, manifest.webmanifest).
8. Upload + deploy через official `actions/deploy-pages@v4`.

## Что НЕ настраивается этим файлом
- **Включение GitHub Pages для репо** — ручное, в Settings → Pages → Source:
  GitHub Actions (не "Deploy from branch").
- **Кастомный домен (CNAME)** — если нужен `kip.<домен>`, добавить файл
  `public/CNAME` с содержимым домена.
- **VITE_API_BASE_URL** — берётся из `.env.production` в репо. Если бэк
  переедет, правится там (или через GitHub Secrets + env: в workflow).

## Что нужно после первого деплоя
1. Открыть `https://<owner>.github.io/<repo>/` (URL появится в логе
   `actions/deploy-pages`).
2. Логин: `+79001111111` / `1111` (тестовый driver) или `+79001000001` /
   `1234` (operator).
3. Проверить что нет CORS-ошибок в DevTools — бэк уже отдаёт
   `Access-Control-Allow-Origin: *` (см. `index.ts` бэкенда).

## История изменений
- **2026-05-21** — создан. Шаги: checkout → typecheck → build с VITE_BASE_PATH
  → SPA-fallback → deploy-pages@v4.
