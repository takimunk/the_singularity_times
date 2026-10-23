# The Singularity Times

Авторская хроника эпохи AGI в форме классической газеты. Что и зачем строим — в [PLAN.md](PLAN.md).

## Разработка

Нужен Node.js 24 (см. `.nvmrc`).

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # статика в dist/
npm run check    # проверка типов
```

## Где что лежит

- `issues/` — номера газеты, один Markdown-файл на номер.
- `src/content.config.ts` — схема номера (поля frontmatter).
- `src/components/` — блоки полосы.
- `src/styles/brand.css` — шрифты, цвета, логотип (бренд).
- `public/_headers` — заголовки безопасности для Cloudflare.

## Деплой

Cloudflare Workers & Pages, подключённый к этому репозиторию: build command `npm run build`, output `dist`.
