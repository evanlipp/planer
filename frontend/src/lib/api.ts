import axios from 'axios'

let accessToken: string | null = null

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
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

export type AuthResponse = {
  accessToken: string
  user: { id: string; username: string }
}

export const authApi = {
  async login(payload: { username: string; password: string }) {
    const { data } = await api.post<AuthResponse>('/auth/login', payload, { withCredentials: true })
    accessToken = data.accessToken
    return data
  },
  async restore() {
    const { data } = await api.post<AuthResponse>('/auth/refresh', {}, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': csrfToken() },
    })
    accessToken = data.accessToken
    return data
  },
  async logout() {
    await api.post('/auth/logout', {}, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': csrfToken() },
    })
    accessToken = null
  },
}
