# Planer

Небольшой планер: Vue 3 + TypeScript для интерфейса, NestJS для API, MongoDB для данных и JWT для авторизации.

## Запуск в разработке

1. Создайте файл окружения: `cp .env.example .env` и задайте надёжный `JWT_SECRET`.
2. Поднимите MongoDB: `docker compose up -d mongo`.
3. В одном терминале: `cd backend && cp .env.example .env && npm run start:dev`.
4. В другом: `cd frontend && npm run dev`.

Интерфейс: http://localhost:5173. API: http://localhost:3000/api. Проверка API: `GET /api/health`.

## Авторизация API

- `POST /api/auth/register` — `{ "name", "email", "password" }`
- `POST /api/auth/login` — `{ "email", "password" }`

Оба метода возвращают JWT `accessToken` и публичные данные пользователя.
