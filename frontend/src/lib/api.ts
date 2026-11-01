import axios from 'axios'

let accessTokenProvider: () => string | null = () => null

export function setAccessTokenProvider(provider: () => string | null) {
  accessTokenProvider = provider
}

let sessionRefresher: (() => Promise<boolean>) | null = null

export function setSessionRefresher(provider: () => Promise<boolean>) {
  sessionRefresher = provider
}

function isUnauthorized(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401
}

// Один вызов → один refresh → одна повторная попытка, без петель.
export async function withAuthRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (!isUnauthorized(error) || !sessionRefresher) throw error
    const refreshed = await sessionRefresher()
    if (!refreshed) throw error
    return await call()
  }
}

function csrfToken() {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith('csrf_token='))
  return entry ? decodeURIComponent(entry.split('=')[1]) : undefined
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const accessToken = accessTokenProvider()
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

export type AuthResponse = {
  accessToken: string
  user: { id: string; username: string }
}

export type PlannerItem = {
  id: string
  type: 'place' | 'event'
  link?: string
  description: string
  date?: string
  createdAt: string
}

export const itemsApi = {
  async list() {
    return withAuthRetry(async () => {
      const { data } = await api.get<{ items: PlannerItem[] }>('/items')
      return data.items
    })
  },
  async create(payload: { type: PlannerItem['type']; link?: string; description: string; date?: string }) {
    return withAuthRetry(async () => {
      const { data } = await api.post<{ item: PlannerItem }>('/items', payload)
      return data.item
    })
  },
}

export const authApi = {
  async login(payload: { username: string; password: string }) {
    const { data } = await api.post<AuthResponse>('/auth/login', payload, { withCredentials: true })
    return data
  },
  async restore() {
    const { data } = await api.post<AuthResponse>('/auth/refresh', {}, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': csrfToken() },
    })
    return data
  },
  async logout() {
    await api.post('/auth/logout', {}, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': csrfToken() },
    })
  },
}
