---
name: gen-icons
created: 2026-06-11
---

# gen-icons.mjs

## Назначение
Генерирует PNG-иконки PWA из `public/icons/favicon.svg`:
`icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (safe zone 80% на
фоне #1e3a8a). Без этих файлов manifest ссылается в пустоту и Chrome не
предлагает установку PWA — обнаружено аудитом прода 2026-06-11.

## Входы/выходы
- Вход: `public/icons/favicon.svg` (источник логотипа).
- Выход: три PNG рядом с ним.
- Зависимость: `sharp` (devDependency).

## Как запускать
```bash
cd kip-frontend
node scripts/gen-icons.mjs
```
Перезапускать при смене логотипа/брендинга, затем пересобрать и задеплоить.

## История изменений
- **2026-06-11** — создан (sharp 0.3x). Первые иконки сгенерированы и задеплоены.
