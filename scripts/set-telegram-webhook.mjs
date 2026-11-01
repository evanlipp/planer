#!/usr/bin/env node
// Регистрирует Telegram webhook на деплой Planer.
// Запуск: node scripts/set-telegram-webhook.mjs https://<домен>
// Нужны переменные окружения: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.

const rawBase = process.argv[2] || process.env.VERCEL_URL || ''
if (!rawBase) {
  console.error('Укажи базовый URL: node scripts/set-telegram-webhook.mjs https://<домен>')
  process.exit(1)
}

const base = rawBase.startsWith('http') ? rawBase.replace(/\/$/, '') : `https://${rawBase.replace(/\/$/, '')}`
const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
if (!token || !secret) {
  console.error('Задай переменные окружения TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET и повтори запуск.')
  process.exit(1)
}

try {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${base}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }),
  })
  const payload = await response.json()
  console.log(payload.ok ? 'ok' : String(payload.description ?? 'unknown error'))
  if (!payload.ok) process.exit(1)
} catch (error) {
  console.error('Webhook registration failed:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
}
