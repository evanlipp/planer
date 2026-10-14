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
    // Two cold starts can seed simultaneously; the unique index is authoritative.
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

function serializeCookie(name: string, value: string, httpOnly: boolean, maxAge = refreshLifetimeSeconds) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/api/auth',
    `Max-Age=${maxAge}`,
    'SameSite=Strict',
  ]
  if (httpOnly) attributes.push('HttpOnly')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) attributes.push('Secure')
  return attributes.join('; ')
}

function clearCookie(name: string, httpOnly: boolean) {
  return serializeCookie(name, '', httpOnly, 0)
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

export default async function handler(request: Request, response: Response) {
  if (!applyCors(request, response)) return
  if (request.method === 'OPTIONS') return response.status(204).end()

  const route = new URL(request.url ?? '/', 'http://localhost').pathname.replace(/^\/api/, '')
  if (!['/health', '/auth/login', '/auth/refresh', '/auth/logout'].includes(route)) {
    return json(response, 404, { message: 'Not found' })
  }
  if ((route === '/health' && request.method !== 'GET') || (route !== '/health' && request.method !== 'POST')) {
    return json(response, 405, { message: 'Method not allowed' })
  }
  if (isRateLimited(request, route, route === '/auth/login' ? 5 : 20)) {
    return json(response, 429, { message: 'Too many requests' })
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
        serializeCookie('refresh_token', session.refreshToken, true),
        serializeCookie('csrf_token', session.csrfToken, false),
      ])
      return json(response, 200, { accessToken: session.accessToken, user: publicUser(user) })
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
      response.setHeader('Set-Cookie', [clearCookie('refresh_token', true), clearCookie('csrf_token', false)])
      return response.status(204).end()
    }

    const session = await createSession(user)
    response.setHeader('Set-Cookie', [
      serializeCookie('refresh_token', session.refreshToken, true),
      serializeCookie('csrf_token', session.csrfToken, false),
    ])
    return json(response, 200, { accessToken: session.accessToken, user: publicUser(user) })
  } catch (error) {
    console.error('API request failed', error)
    return json(response, 500, { message: 'Internal server error' })
  }
}
