# DEPLOY — «голый» bare-HTTP вариант (работа БЕЗ VPN, временный)

## Назначение
Отдать приложение КИП целиком с корп-сервера по `http://185.196.118.7/kipapp/`, чтобы
работало в РФ **без VPN** (минуя GitHub Pages и Cloudflare, которые в РФ режутся).
**Временный костыль** до перехода на `https://kip.dkbi.ru` (см.
`ИНСТРУКЦИЯ_айтишнику_DKBI_kip-БЕЗ-VPN.md`).

## Боевой URL
`http://185.196.118.7/kipapp/`
- Страница — **single-file** `index.html` (весь JS+CSS инлайн), отдаётся nginx-proxy на
  DKBIAGT01 из `/usr/share/nginx/html/kipapp/index.html`.
- API — тот же origin: `/driver-api/...` → контейнер `kip-driver-app` (существующий маршрут).
- Один origin → без CORS, без Cloudflare, без GitHub.

## ⚠️ Почему single-file (важно)
Публичный шлюз `185.196.118.7` (отдельный Ubuntu-nginx перед DKBIAGT01) на порту **:80
принудительно ставит `Content-Type: text/html` ВСЕМ ответам** (проверено: JS-байты верные, но
тип text/html; API-JSON тоже text/html + `nosniff`). Браузер отказывается исполнять внешний
`<script type="module">` с типом text/html → **белый экран**. Обходы (всё на стороне приложения,
шлюз не трогаем):
1. **Сборка в один файл** (`vite-plugin-singlefile`, профиль `corp`): JS+CSS инлайнятся в
   index.html. Инлайн-скрипт НЕ фетчится отдельно → MIME-проверки нет → исполняется. Сама
   страница — text/html, что для HTML корректно.
2. **apiClient парсит тело как JSON независимо от Content-Type** (`src/api/client.ts`) — данные
   приходят мислейбленными text/html, но это валидный JSON.
PWA в профиле corp отключён (по http service worker всё равно не работает).
Правильное решение без этих костылей — `https://kip.dkbi.ru` на :443 (там типы не ломаются,
как у moodle); нужен айтишник DKBI.

## Ограничения (важно)
- **По http нет service worker** → нет офлайн-загрузки и установки «как приложение» (PWA).
  Оффлайн-очередь отправки (Dexie) работает после загрузки, но закрытое без связи приложение
  не откроется. Для полноценного PWA нужен HTTPS → `kip.dkbi.ru`.
- URL — «голый» IP (некрасиво, браузер пишет «не защищено»). Норма для стопгапа.

## Как собрать и выложить (повтор/обновление)
Профиль сборки: `.env.corp` (`VITE_BASE_PATH=/kipapp/`, `VITE_API_BASE_URL=/driver-api`).

```bash
cd kip-frontend
npx vite build --mode corp                 # → dist/ с base=/kipapp/, API=/driver-api
tar -C dist -czf /tmp/kipapp.tgz .
cat /tmp/kipapp.tgz | ssh kip-corp 'cat > /tmp/kipapp.tgz'
ssh kip-corp '
  rm -rf /home/administrator/kip-spa/kipapp && mkdir -p /home/administrator/kip-spa/kipapp
  tar -C /home/administrator/kip-spa/kipapp -xzf /tmp/kipapp.tgz
  docker cp /home/administrator/kip-spa/kipapp nginx-proxy:/usr/share/nginx/html/'
```
Проверка: `curl -o /dev/null -w "%{http_code}" http://185.196.118.7/kipapp/` → 200.

## nginx (уже сделано, persist)
В `/home/administrator/nginx-proxy/nginx.conf` (под git, bind-mount в nginx-proxy) добавлен блок
перед catch-all `location / {`:
```nginx
    location /kipapp/ {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /kipapp/index.html;
    }
```
После правки конфига: `docker restart nginx-proxy` (bind-mount одного файла — reload не всегда видит).
Бэкап исходного: `/home/administrator/nginx-proxy/nginx.conf.bak.kipapp`.

## ⚠️ Долговечность
- **Конфиг** nginx — persist (на хосте, под git). Переживает пересоздание nginx-proxy.
- **Статика** скопирована внутрь контейнера (`docker cp`) → **исчезнет при пересоздании
  nginx-proxy**. Восстановление — повторить `docker cp` из `/home/administrator/kip-spa/kipapp`
  (host-копия сохранена). Можно сделать durable, смонтировав host-каталог томом (требует
  пересоздания контейнера) — отложено до `kip.dkbi.ru`.

## История изменений
- 2026-06-20 — создан. Поднят bare-HTTP `http://185.196.118.7/kipapp/` (страница+API с корп-сервера,
  без Cloudflare/GitHub) для работы без VPN. Проверено: страница/ассеты/SPA-маршрут/API = 200,
  соседние приложения целы. Скорость ~0.27с (vs ~0.7с через Cloudflare).
