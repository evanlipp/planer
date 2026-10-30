# Planer — манифест проекта

Планер: Vue 3 + TypeScript во фронтенде, один Vercel Function как API, MongoDB через Mongoose, JWT-авторизация.
Репозиторий небольшой и намеренно плоский — не добавляй слои, абстракции и зависимости «на будущее».

## Структура

| Путь | Что это |
| --- | --- |
| `frontend/src/` | Vue 3 SPA: `views/`, `stores/` (Pinia), `lib/api.ts` (axios), `router/` |
| `lib/api-handler.ts` | Весь API: один handler, allowlist маршрутов, CORS, rate limit, auth |
| `api/**/*.ts` | Тонкие обёртки: `export { config, default } from '../../lib/api-handler'` |
| `vercel.json` | Сборка, CSP и защитные заголовки |
| `docker-compose.yml` | Локальная MongoDB |
| `.vercel/`, `frontend/dist/`, `node_modules/`, `backend/dist/` | Артефакты сборки. Не редактировать |

## Команды

```bash
npm run api:dev                 # Vercel dev, API на http://localhost:38147/api
cd frontend && npm run dev      # Vite на http://localhost:5174
npm run build --prefix frontend # vue-tsc + vite build — обязательная проверка
docker compose up -d mongo      # локальная MongoDB
```

Тестов и линтера в проекте нет. Не придумывай `npm test` и не добавляй раннеры без явного согласования.
Проверка типов и сборки — единственный автоматический гейт, поэтому он обязателен перед сдачей.

## Инварианты безопасности (нарушать нельзя)

1. Access token живёт только в памяти вкладки (ref в Pinia). Никогда не `localStorage`, не `sessionStorage`, не в URL.
2. `refresh_token` — `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, `Secure` в production. Ротируется при каждом refresh.
3. `csrf_token` — читаемая cookie + заголовок `X-CSRF-Token` обязателен для `/api/auth/refresh` и `/api/auth/logout`.
4. Браузерные origin'ы только из `FRONTEND_ORIGINS`. Не ослаблять CORS и не добавлять `*`.
5. Тело запроса ограничено 16 KB (`config.api.bodyParser.sizeLimit`).
6. Rate limit на инстанс: `/auth/login` — 5/мин, остальные — 20/мин. Логику не обходить.
7. Секреты только через env: `MONGODB_URI`, `JWT_SECRET` (≥ 32 символов), `FRONTEND_ORIGINS`, `INITIAL_USERNAME`/`INITIAL_PASSWORD`.
   Ничего секретного не попадает в `VITE_*` — этот префикс уезжает в браузерный bundle.
8. CSP и защитные заголовки меняются только в `vercel.json`.
9. `.env`, `.env.local`, `.env.production*` не читать и не коммитить.
10. Новый маршрут API = запись в allowlist `lib/api-handler.ts` + файл-реэкспорт в `api/`.

## Соглашения кода

- 2 пробела, без точек с запятой, одинарные кавычки, `const` по умолчанию, early return.
- Vue: `<script setup lang="ts">`, `scoped`-стили, текст интерфейса по-русски.
- API: один handler, локальные `type Request/Response`, ответы через `json(response, status, { message })`.
- Комментарии только там, где логика неочевидна (пример: гонка двух cold start в `bootstrapInitialUser`).
- Ошибки наружу — без внутренних деталей: клиент получает `{ message }`, детали идут в `console.error`.
- Новые зависимости — только с явного согласования.

## Роли

| Агент | Режим | Модель | Права |
| --- | --- | --- | --- |
| `orchestrator` | primary, по умолчанию | `opencode/glm-5.3-flash-free` | читает всё; правит только `docs/plans/**`, `AGENTS.md`, `opencode.jsonc`, `.opencode/**`; вызывает трёх подагентов |
| `architect` | subagent | `opencode/big-pickle` | read-only + `git status/log/diff` |
| `coder` | subagent | `opencode/deepseek-v4.1-flash-free` | правит код, запускает сборку; без `git push`, `reset --hard`, `rm -rf`, `npm publish` |
| `reviewer` | subagent | `opencode/big-pickle` | read-only + `git diff/status/log` + сборка |

Поток: **orchestrator → architect → coder → reviewer → (coder → reviewer)* → orchestrator**.
Протокол и форматы сообщений — в скилле `planer-orchestration`.

## Definition of done

- Задача сформулирована и не расширена по ходу.
- `npm run build --prefix frontend` проходит (для изменений фронтенда или общих типов).
- Для изменений API: `npm run api:dev` + `curl -i http://localhost:38147/api/health`.
- Изменённый сценарий проверен вручную или аргументированно признан непроверяемым.
- Ревьюер не оставил блокирующих замечаний.
- Инварианты безопасности не нарушены, секретов в диффе нет.
