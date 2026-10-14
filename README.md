# Planer

Небольшой планер: Vue 3 + TypeScript для интерфейса, NestJS для API, MongoDB для данных и JWT для авторизации.

## Запуск в разработке

1. Создайте файл окружения: `cp .env.example .env` и задайте случайный `JWT_SECRET` длиной не менее 32 символов. Не коммитьте этот файл.
2. Поднимите API и MongoDB: `docker compose up --build`.
3. В другом терминале запустите интерфейс: `cd frontend && npm run dev`.

Интерфейс: http://localhost:5174. API: http://localhost:38147/api. MongoDB доступна только локально на `127.0.0.1:38148`. Проверка API: `GET /api/health`.

## Авторизация API

- `POST /api/auth/login` — `{ "username", "password" }`
- `POST /api/auth/refresh` — выдаёт новый access token из refresh-cookie
- `POST /api/auth/logout` — завершает сессию

Вход возвращает короткоживущий JWT `accessToken` и публичные данные пользователя. Публичной регистрации нет: пользователей создаёт администратор. Refresh token хранится 7 дней только в `HttpOnly` cookie и ротируется при обновлении; Axios восстанавливает вход после перезагрузки страницы.

## Безопасность

- API принимает браузерные запросы только от адресов в `backend/.env` → `FRONTEND_ORIGINS`; для локальной разработки это `http://localhost:5174`.
- Access token передаётся Axios через `Authorization` и хранится только в памяти вкладки, не в `localStorage`. Refresh token живёт в `HttpOnly`, `SameSite=Strict` cookie; в production дополнительно включается `Secure`.
- Обновление и завершение сессии требуют CSRF-токен в заголовке `X-CSRF-Token`; этот токен ротируется вместе с refresh token.
- Helmet добавляет защитные HTTP-заголовки; размер JSON-запроса ограничен 16 KB; регистрация и вход имеют более строгий rate limit.
- MongoDB не опубликована на хост и доступна только сервисам Docker Compose.
- Для Vercel задана CSP и защитные заголовки в `frontend/vercel.json`. При раздельном домене API нужно явно добавить его в CSP `connect-src` и в `FRONTEND_ORIGINS` backend.

## Deployment

Проект развёртывается одним Vercel-проектом из корня репозитория: Vite собирается в `frontend/dist`, а Nest API запускается как Vercel Function по пути `/api/*`. Поэтому frontend и API используют один origin, а refresh-cookie продолжает работать с `SameSite=Strict`.

MongoDB в Vercel не запускается как Docker-контейнер. Создайте небольшой Atlas Free кластер и добавьте в Vercel Production Environment Variables:

- `MONGODB_URI` — Atlas connection string;
- `JWT_SECRET` — новый случайный секрет длиной не менее 32 символов;
- `FRONTEND_ORIGINS` — точный URL Vercel-приложения, например `https://planer.vercel.app`;
- `NODE_ENV=production`.

Чтобы при первом запуске создать пользователя, добавьте также `INITIAL_USERNAME` и `INITIAL_PASSWORD` (минимум 12 символов). Они используются только если такого пользователя ещё нет; пароль сохраняется только как bcrypt-хеш и не перезаписывается. После первого успешного запуска эти две переменные можно удалить из Vercel.

Не добавляйте эти значения в `VITE_*`: всё с таким префиксом попадает в браузерный bundle. Шаблон — `backend/.env.production.example`.
