# Planer

Небольшой планер: Vue 3 + TypeScript для интерфейса, Vercel Function для API, MongoDB для данных и JWT для авторизации.

## Запуск в разработке

1. Создайте файл окружения: `cp .env.example .env` и задайте случайный `JWT_SECRET` длиной не менее 32 символов. Не коммитьте этот файл.
2. Поднимите локальную MongoDB: `docker compose up -d mongo`.
3. В одном терминале запустите API: `npm run api:dev`.
4. В другом терминале запустите интерфейс: `cd frontend && npm run dev`.

Интерфейс: http://localhost:5174. API: http://localhost:38147/api. MongoDB доступна только локально на `127.0.0.1:38148`. Проверка API: `GET /api/health`.

## Авторизация API

- `POST /api/auth/login` — `{ "username", "password" }`
- `POST /api/auth/refresh` — выдаёт новый access token из refresh-cookie
- `POST /api/auth/logout` — завершает сессию

Вход возвращает короткоживущий JWT `accessToken` и публичные данные пользователя. Публичной регистрации нет: пользователей создаёт администратор. Refresh token хранится 7 дней только в `HttpOnly` cookie и ротируется при обновлении; Axios восстанавливает вход после перезагрузки страницы.

## Элементы плана и Telegram-бот

- `GET /api/items` — список последних 200 записей; нужен `Authorization: Bearer <accessToken>`.
- `POST /api/items` — создать запись: `{ "type": "place" | "event", "description", "link?", "date?" }`; `date` принимается только для события и только в RFC 3339 с явным смещением (например `2026-11-05T19:00:00+03:00`).
- `POST /api/telegram/webhook` — вебхук Telegram: входящее сообщение разбирается через Gemini, распознанные место или событие сохраняются в план.

Все переменные ниже — необязательные, задаются в Vercel и никогда не коммитятся. Пока они не заданы, API работает как раньше.

- `TELEGRAM_BOT_TOKEN` — токен бота, через который бот отвечает пользователю.
- `TELEGRAM_WEBHOOK_SECRET` — случайный секрет: если не задан, вебхук отвечает 503; Telegram подписывает им каждый запрос.
- `TELEGRAM_ALLOWED_USER_IDS` — через запятую Telegram ID пользователей, чьи сообщения обрабатываются.
- `TELEGRAM_OWNER_USERNAME` — username пользователя планера, в чей список попадают записи.
- `TELEGRAM_OWNER_TIMEZONE` — часовой пояс владельца, по умолчанию `Europe/Moscow`; используется при разборе дат.
- `GEMINI_API_KEY` — ключ Gemini API для разбора текста.
- `GEMINI_MODEL` — модель Gemini, по умолчанию `gemini-3.5-flash-lite`.

Вебхук настраивается один раз после деплоя:

```bash
node scripts/set-telegram-webhook.mjs https://<домен>
```

## Безопасность

- API принимает браузерные запросы только от адресов в `.env` → `FRONTEND_ORIGINS`; для локальной разработки это `http://localhost:5174`.
- Access token передаётся Axios через `Authorization` и хранится только в памяти вкладки, не в `localStorage`. Refresh token живёт в `HttpOnly`, `SameSite=Strict` cookie; в production дополнительно включается `Secure`.
- Обновление и завершение сессии требуют CSRF-токен в заголовке `X-CSRF-Token`; этот токен ротируется вместе с refresh token.
- Размер JSON-запроса ограничен 16 KB; вход имеет ограничение частоты на экземпляр функции. CSP и остальные защитные HTTP-заголовки задаются Vercel для всех ответов.
- MongoDB не опубликована на хост и доступна только сервисам Docker Compose.
- При раздельном домене API нужно явно добавить его в CSP `connect-src` и в `FRONTEND_ORIGINS`.

## Deployment

Проект развёртывается одним Vercel-проектом: Vite собирается в статический frontend, а `api/[...path].ts` обслуживает `/api/*`. Frontend и API используют один origin, поэтому refresh-cookie продолжает работать с `SameSite=Strict`.

MongoDB в Vercel не запускается как Docker-контейнер. Создайте небольшой Atlas Free кластер и добавьте в Vercel Production Environment Variables:

- `MONGODB_URI` — Atlas connection string;
- `JWT_SECRET` — новый случайный секрет длиной не менее 32 символов;
- `FRONTEND_ORIGINS` — точный URL Vercel-приложения, например `https://planer.vercel.app`;
- `NODE_ENV=production`.

Чтобы при первом запуске создать пользователя, добавьте также `INITIAL_USERNAME` и `INITIAL_PASSWORD` (минимум 12 символов). Они используются только если такого пользователя ещё нет; пароль сохраняется только как bcrypt-хеш и не перезаписывается. После первого успешного запуска эти две переменные можно удалить из Vercel.

Не добавляйте эти значения в `VITE_*`: всё с таким префиксом попадает в браузерный bundle. Шаблон — `.env.production.example`.
