import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type AuthResponse } from '../lib/api'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const user = ref<AuthResponse['user'] | null>(null)
  const initialized = ref(false)
  const isAuthenticated = computed(() => Boolean(accessToken.value && user.value))

  function setSession(session: AuthResponse) {
    accessToken.value = session.accessToken
    user.value = session.user
  }

  function clearSession() {
    accessToken.value = null
    user.value = null
  }

  async function restoreSession() {
    if (initialized.value) return
    try { setSession(await authApi.restore()) } catch { clearSession() } finally { initialized.value = true }
  }

  async function login(username: string, password: string) {
    setSession(await authApi.login({ username, password }))
    initialized.value = true
  }

  async function logout() {
    try { await authApi.logout() } finally { clearSession() }
  }

  return { accessToken, user, initialized, isAuthenticated, restoreSession, login, logout }
})
