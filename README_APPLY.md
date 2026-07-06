# Как применить V-19 Premium Product Upgrade

## Вариант А — заменить только src

1. Сделай backup текущего проекта.
2. Распакуй `v19-premium-product-src.zip` в корень проекта так, чтобы папка `src` заменила текущую.
3. Запусти проверки:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

## Вариант B — bundle

Распакуй `v19-premium-product-upgrade-bundle.zip` в корень проекта. Он содержит:

- `src/` — доработанный source;
- `scripts/verify-v19-premium-upgrade.mjs` — structural guard;
- `docs/ui/v19-product-upgrade-report.md` — отчёт;
- `v19-premium-product-upgrade.patch` — diff для ревью.

Проверка:

```bash
node scripts/verify-v19-premium-upgrade.mjs
npm run typecheck
npm run lint
npm run build
```

Если у тебя уже есть незакоммиченные изменения, сначала сделай:

```bash
git status --short
git diff > before-v19-premium-upgrade.patch
```
