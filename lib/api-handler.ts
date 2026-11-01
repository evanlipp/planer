import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose, { type HydratedDocument } from 'mongoose'

export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
}

type User = {
  username: string
  passwordHash: string
  refreshTokenHash?: string
  csrfTokenHash?: string
}

type Item = {
  userId: mongoose.Types.ObjectId
  type: 'place' | 'event'
  link?: string
  description: string
  date?: Date
  createdAt?: Date
  updatedAt?: Date
}

type Request = {
  method?: string
  url?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

type Response = {
  status: (code: number) => Response
  json: (body: unknown) => void
  end: () => void
  setHeader: (name: string, value: string | string[]) => void
}

const usernamePattern = /^[a-zA-Z0-9_.-]{3,32}$/
const refreshLifetimeSeconds = 60 * 60 * 24 * 7
const globalStore = globalThis as typeof globalThis & {
  plannerDatabase?: Promise<typeof mongoose>
  plannerBootstrapped?: Promise<void>
}

const UserModel =
  (mongoose.models.PlannerUser as mongoose.Model<User>) ||
  mongoose.model<User>(
    'PlannerUser',
    new mongoose.Schema<User>(
      {
        username: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        refreshTokenHash: { type: String, select: false },
        csrfTokenHash: { type: String, select: false },
      },
      { timestamps: true },
    ),
  )

const ItemModel =
  (mongoose.models.PlannerItem as mongoose.Model<Item>) ||
  mongoose.model<Item>(
    'PlannerItem',
    new mongoose.Schema<Item>(
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlannerUser', required: true, index: true },
        type: { type: String, required: true, enum: ['place', 'event'] },
        link: String,
        description: { type: String, required: true },
        date: Date,
      },
      { timestamps: true },
    ),
  )

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function applicationConfig() {
  const mongodbUri = requiredEnvironment('MONGODB_URI')
  const jwtSecret = requiredEnvironment('JWT_SECRET')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')

  const origins = requiredEnvironment('FRONTEND_ORIGINS')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

  for (const origin of origins) new URL(origin)
  if (origins.length === 0) throw new Error('FRONTEND_ORIGINS must contain at least one URL')

  const initialUsername = process.env.INITIAL_USERNAME?.trim().toLowerCase()
  const initialPassword = process.env.INITIAL_PASSWORD
  if (Boolean(initialUsername) !== Boolean(initialPassword)) {
    throw new Error('INITIAL_USERNAME and INITIAL_PASSWORD must be set together')
  }
  if (initialUsername && !usernamePattern.test(initialUsername)) {
    throw new Error('INITIAL_USERNAME has an invalid format')
  }
  if (initialPassword && initialPassword.length < 12) {
    throw new Error('INITIAL_PASSWORD must contain at least 12 characters')
  }

  return { mongodbUri, jwtSecret, origins, initialUsername, initialPassword }
}

const env = applicationConfig()

async function connectDatabase() {
  if (!globalStore.plannerDatabase) {
    globalStore.plannerDatabase = mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 8_000,
    })
  }
  await globalStore.plannerDatabase

  if (!globalStore.plannerBootstrapped) {
    globalStore.plannerBootstrapped = bootstrapInitialUser()
  }
  await globalStore.plannerBootstrapped
}

async function bootstrapInitialUser() {
  if (!env.initialUsername || !env.initialPassword) return
  if (await UserModel.exists({ username: env.initialUsername })) return

  try {
    await UserModel.create({
      username: env.initialUsername,
      passwordHash: await bcrypt.hash(env.initialPassword, 12),
    })
  } catch (error: unknown) {
    // Два cold start могут создать пользователя одновременно; уникальный индекс решает.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return
    throw error
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function tokensEqual(value: string | undefined, expectedHash: string | undefined) {
  if (!value || !expectedHash) return false
  const actual = Buffer.from(hash(value))
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function requestHeader(request: Request, name: string) {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function parseCookies(request: Request) {
  const header = requestHeader(request, 'cookie') ?? ''
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const index = part.indexOf('=')
      if (index < 1) return []
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]]
    }),
  )
}

function serializeCookie(name: string, value: string, httpOnly: boolean, path: string, maxAge = refreshLifetimeSeconds) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'SameSite=Strict',
  ]
  if (httpOnly) attributes.push('HttpOnly')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) attributes.push('Secure')
  return attributes.join('; ')
}

function clearCookie(name: string, httpOnly: boolean, path: string) {
  return serializeCookie(name, '', httpOnly, path, 0)
}

function issueAccessToken(user: HydratedDocument<User>) {
  return jwt.sign({ sub: user._id.toString(), username: user.username }, env.jwtSecret, { expiresIn: '15m' })
}

async function createSession(user: HydratedDocument<User>) {
  const refreshToken = randomBytes(48).toString('base64url')
  const csrfToken = randomBytes(32).toString('base64url')
  user.refreshTokenHash = hash(refreshToken)
  user.csrfTokenHash = hash(csrfToken)
  await user.save()
  return { accessToken: issueAccessToken(user), refreshToken, csrfToken }
}

function publicUser(user: HydratedDocument<User>) {
  return { id: user._id.toString(), username: user.username }
}

function bodyWithCredentials(body: unknown): { username: string; password: string } | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const value = body as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== 'username' && key !== 'password')) return undefined
  if (typeof value.username !== 'string' || typeof value.password !== 'string') return undefined
  return { username: value.username, password: value.password }
}

type RateLimit = { count: number; resetAt: number }
const rateLimits = new Map<string, RateLimit>()

function isRateLimited(request: Request, route: string, ceiling: number) {
  const forwardedFor = requestHeader(request, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const key = `${route}:${forwardedFor}`
  const now = Date.now()
  const entry = rateLimits.get(key)
  if (!entry || entry.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count += 1
  return entry.count > ceiling
}

function json(response: Response, status: number, body: unknown) {
  response.status(status).json(body)
}

function applyCors(request: Request, response: Response) {
  const origin = requestHeader(request, 'origin')?.replace(/\/$/, '')
  if (!origin) return true
  if (!env.origins.includes(origin)) {
    json(response, 403, { message: 'Origin is not allowed' })
    return false
  }
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Vary', 'Origin')
  return true
}

function verifyAccessToken(request: Request): string | undefined {
  const header = requestHeader(request, 'authorization')
  if (!header?.startsWith('Bearer ')) return undefined
  try {
    const payload = jwt.verify(header.slice('Bearer '.length).trim(), env.jwtSecret)
    if (typeof payload !== 'object') return undefined
    const sub = (payload as { sub?: unknown }).sub
    return typeof sub === 'string' ? sub : undefined
  } catch {
    return undefined
  }
}

type ItemDto = {
  id: string
  type: 'place' | 'event'
  link?: string
  description: string
  date?: string
  createdAt?: string
}

type ParsedItem = {
  type: 'place' | 'event'
  link?: string
  description: string
  date?: Date
}

const itemDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/

function parseIsoInstant(value: string): Date | undefined {
  if (!itemDatePattern.test(value)) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  const year = date.getUTCFullYear()
  if (year < 2000 || year > 2100) return undefined
  return date
}

function parseHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

function parseItemBody(body: unknown): ParsedItem | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const value = body as Record<string, unknown>
  const allowedKeys = ['type', 'link', 'description', 'date']
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return undefined
  if (value.type !== 'place' && value.type !== 'event') return undefined
  if (typeof value.description !== 'string') return undefined
  const description = value.description.trim()
  if (description.length < 1 || description.length > 2000) return undefined

  let link: string | undefined
  if (value.link !== undefined) {
    if (typeof value.link !== 'string') return undefined
    if (value.link.trim()) {
      if (value.link.length > 2048) return undefined
      link = parseHttpsUrl(value.link.trim())
      if (!link) return undefined
    }
  }

  let date: Date | undefined
  if (value.date !== undefined) {
    if (value.type !== 'event' || typeof value.date !== 'string') return undefined
    date = parseIsoInstant(value.date.trim())
    if (!date) return undefined
  }

  return { type: value.type, link, description, date }
}

function toItemDto(item: HydratedDocument<Item>): ItemDto {
  return {
    id: item._id.toString(),
    type: item.type,
    link: item.link || undefined,
    description: item.description,
    date: item.date ? item.date.toISOString() : undefined,
    createdAt: item.createdAt?.toISOString(),
  }
}

type TelegramUpdate = {
  message?: {
    text?: string
    from?: { id?: number }
    chat?: { id?: number }
  }
}

type GeminiDraft = {
  type?: unknown
  link?: unknown
  description?: unknown
  date?: unknown
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

function telegramAllowedUserIds(): number[] {
  return (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))
}

function geminiPrompt(timezone: string, text: string) {
  return [
    'Ниже — сообщение пользователя планера. Определи, содержит ли оно конкретное место или событие, которое стоит сохранить. Ничего от себя не придумывай.',
    `Часовой пояс пользователя: ${timezone}. Текущее время: ${new Date().toISOString()}. Относительные даты («завтра в 8», «в пятницу») переводи в конкретную дату относительно этого времени.`,
    'date верни строкой RFC 3339 с явным смещением от UTC (например 2026-05-01T19:00:00+03:00); если дата не определяется — null.',
    'type: "event" для события, "place" для места. Если конкретного места или события в сообщении нет (приветствие, вопрос, болтовня), верни type = "" и description = "" — это сигнал, что сохранять нечего.',
    'link заполняй, только если в тексте сообщения есть URL.',
    '',
    'Сообщение пользователя:',
    text,
  ].join('\n')
}

async function parseWithGemini(apiKey: string, model: string, timezone: string, text: string): Promise<GeminiDraft> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: geminiPrompt(timezone, text) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING', enum: ['event', 'place', ''] },
              link: { type: 'STRING', nullable: true },
              description: { type: 'STRING' },
              date: { type: 'STRING', nullable: true },
            },
            required: ['type', 'description'],
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`)
  const payload = await response.json() as GeminiResponse
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  const draft = JSON.parse(content) as GeminiDraft
  if (!draft || typeof draft !== 'object') throw new Error('Gemini returned unexpected payload')
  return draft
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    console.error('Failed to send Telegram message', error)
  }
}

function formatItemDate(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'long', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

async function handleTelegramUpdate(
  owner: HydratedDocument<User>,
  botToken: string,
  geminiApiKey: string,
  geminiModel: string,
  timezone: string,
  chatId: number,
  text: string,
) {
  let draft: GeminiDraft
  try {
    draft = await parseWithGemini(geminiApiKey, geminiModel, timezone, text)
  } catch (error) {
    console.error('Gemini parsing failed', error)
    await sendTelegramMessage(botToken, chatId, 'Не смог разобрать сообщение, возможно, сервис анализа недоступен. Попробуй ещё раз позже.')
    return
  }

  const type = draft.type
  const description = typeof draft.description === 'string' ? draft.description.trim().slice(0, 2000) : ''
  if ((type !== 'place' && type !== 'event') || description.length < 3) {
    await sendTelegramMessage(botToken, chatId, 'Не понял, что это — место или событие. Напиши конкретнее: что и когда, или пришли ссылку.')
    return
  }

  let link: string | undefined
  const rawLink = typeof draft.link === 'string' ? draft.link.trim() : ''
  if (rawLink) link = parseHttpsUrl(rawLink)

  const rawDate = typeof draft.date === 'string' ? draft.date.trim() : ''
  const date = rawDate ? parseIsoInstant(rawDate) : undefined

  try {
    // Дата имеет смысл только у событий: у мест она не сохраняется, как и в POST /api/items
    await ItemModel.create({ userId: owner._id, type, link, description, date: type === 'event' ? date : undefined })
  } catch (error) {
    console.error('Failed to create planner item from Telegram', error)
    await sendTelegramMessage(botToken, chatId, 'Понял тебя, но сохранить запись не получилось. Попробуй позже.')
    return
  }

  const label = type === 'event' ? 'Сохранил событие' : 'Сохранил место'
  let suffix = ''
  if (type === 'place' && rawDate) {
    suffix = ' — дату не учитываю, сохранил место без неё'
  } else if (type === 'event' && date) {
    suffix = ` — ${formatItemDate(date, timezone)}`
  } else if (type === 'event' && rawDate) {
    suffix = ' — дату не понял, сохранил без неё'
  }
  await sendTelegramMessage(botToken, chatId, `${label}: ${description}${suffix}`)
}

async function handleTelegramWebhook(request: Request, response: Response) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not set; refusing Telegram webhook')
    return json(response, 503, { message: 'Telegram webhook is not configured' })
  }
  if (!tokensEqual(requestHeader(request, 'x-telegram-bot-api-secret-token'), hash(webhookSecret))) {
    return json(response, 401, { message: 'Unauthorized' })
  }

  const update = request.body as TelegramUpdate | undefined
  const message = update?.message
  if (!message || typeof message.text !== 'string' || !message.text.trim()) {
    return json(response, 200, { ok: true })
  }

  const chatId = message.chat?.id
  const fromId = message.from?.id
  const allowedUserIds = telegramAllowedUserIds()
  if (typeof chatId !== 'number' || typeof fromId !== 'number' || !allowedUserIds.includes(fromId)) {
    if (allowedUserIds.length === 0) console.warn('TELEGRAM_ALLOWED_USER_IDS is not set; ignoring Telegram update')
    return json(response, 200, { ok: true })
  }

  const ownerUsername = process.env.TELEGRAM_OWNER_USERNAME?.trim().toLowerCase()
  if (!ownerUsername) {
    console.error('TELEGRAM_OWNER_USERNAME is not set; ignoring Telegram update')
    return json(response, 200, { ok: true })
  }

  let owner: HydratedDocument<User> | undefined
  try {
    owner = await UserModel.findOne({ username: ownerUsername }) ?? undefined
  } catch (error) {
    console.error('Telegram owner lookup failed; ignoring update', error)
    return json(response, 200, { ok: true })
  }
  if (!owner) {
    console.error(`Telegram owner user "${ownerUsername}" was not found; ignoring update`)
    return json(response, 200, { ok: true })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim()
  if (!botToken || !geminiApiKey) {
    console.error('TELEGRAM_BOT_TOKEN or GEMINI_API_KEY is not set; ignoring Telegram update')
    return json(response, 200, { ok: true })
  }

  const timezone = process.env.TELEGRAM_OWNER_TIMEZONE?.trim() || 'Europe/Moscow'
  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
  try {
    await handleTelegramUpdate(owner, botToken, geminiApiKey, geminiModel, timezone, chatId, message.text.slice(0, 2000))
  } catch (error) {
    console.error('Telegram update processing failed', error)
  }
  return json(response, 200, { ok: true })
}

const routeMethods: Record<string, readonly ('GET' | 'POST')[]> = {
  '/health': ['GET'],
  '/auth/login': ['POST'],
  '/auth/refresh': ['POST'],
  '/auth/logout': ['POST'],
  '/items': ['GET', 'POST'],
  '/telegram/webhook': ['POST'],
}

const rateCeilings: Record<string, number> = {
  '/auth/login': 5,
  '/telegram/webhook': 60,
}

export default async function handler(request: Request, response: Response) {
  if (!applyCors(request, response)) return
  if (request.method === 'OPTIONS') return response.status(204).end()

  const route = new URL(request.url ?? '/', 'http://localhost').pathname.replace(/^\/api/, '')
  const allowedMethods = routeMethods[route]
  if (!allowedMethods) return json(response, 404, { message: 'Not found' })
  if (request.method !== 'GET' && request.method !== 'POST') return json(response, 405, { message: 'Method not allowed' })
  if (!allowedMethods.includes(request.method)) return json(response, 405, { message: 'Method not allowed' })
  if (isRateLimited(request, route, rateCeilings[route] ?? 20)) {
    return json(response, 429, { message: 'Too many requests' })
  }

  // Telegram присылает запросы без Origin (CORS уже пропустил) и без cookie:
  // авторизация — по секретному заголовку внутри handleTelegramWebhook.
  if (route === '/telegram/webhook') {
    try {
      await connectDatabase()
    } catch (error) {
      console.error('Database is unavailable; ignoring Telegram update', error)
      return json(response, 200, { ok: true })
    }
    return handleTelegramWebhook(request, response)
  }

  try {
    await connectDatabase()

    if (route === '/health') return json(response, 200, { status: 'ok' })

    if (route === '/auth/login') {
      const credentials = bodyWithCredentials(request.body)
      if (!credentials || !usernamePattern.test(credentials.username) || credentials.password.length < 1) {
        return json(response, 400, { message: 'Invalid credentials' })
      }
      const user = await UserModel.findOne({ username: credentials.username.toLowerCase() }).select('+passwordHash +refreshTokenHash +csrfTokenHash')
      if (!user || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
        return json(response, 401, { message: 'Invalid username or password' })
      }
      const session = await createSession(user)
      response.setHeader('Set-Cookie', [
        serializeCookie('refresh_token', session.refreshToken, true, '/api/auth'),
        serializeCookie('csrf_token', session.csrfToken, false, '/'),
      ])
      return json(response, 200, { accessToken: session.accessToken, user: publicUser(user) })
    }

    if (route === '/items') {
      const userId = verifyAccessToken(request)
      if (!userId || !mongoose.isValidObjectId(userId)) return json(response, 401, { message: 'Unauthorized' })
      if (request.method === 'GET') {
        const items = await ItemModel.find({ userId }).sort('-createdAt').limit(200)
        return json(response, 200, { items: items.map(toItemDto) })
      }
      const parsed = parseItemBody(request.body)
      if (!parsed) return json(response, 400, { message: 'Invalid item' })
      const created = await ItemModel.create({ userId, ...parsed })
      return json(response, 201, { item: toItemDto(created) })
    }

    const cookies = parseCookies(request)
    const csrfHeader = requestHeader(request, 'x-csrf-token')
    const user = await UserModel.findOne({ refreshTokenHash: hash(cookies.refresh_token ?? '') }).select('+refreshTokenHash +csrfTokenHash')
    if (!user || !tokensEqual(cookies.refresh_token, user.refreshTokenHash) || !tokensEqual(csrfHeader, user.csrfTokenHash)) {
      return json(response, 401, { message: 'Session is invalid or expired' })
    }

    if (route === '/auth/logout') {
      user.refreshTokenHash = undefined
      user.csrfTokenHash = undefined
      await user.save()
      response.setHeader('Set-Cookie', [clearCookie('refresh_token', true, '/api/auth'), clearCookie('csrf_token', false, '/')])
      return response.status(204).end()
    }

    const session = await createSession(user)
    response.setHeader('Set-Cookie', [
      serializeCookie('refresh_token', session.refreshToken, true, '/api/auth'),
      serializeCookie('csrf_token', session.csrfToken, false, '/'),
    ])
    return json(response, 200, { accessToken: session.accessToken, user: publicUser(user) })
  } catch (error) {
    console.error('API request failed', error)
    return json(response, 500, { message: 'Internal server error' })
  }
}
