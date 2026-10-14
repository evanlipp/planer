<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function submitAuth() {
  error.value = ''
  if (username.value.trim().length < 3 || password.value.length < 6) {
    error.value = 'Логин должен содержать минимум 3 символа, пароль — минимум 6.'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    password.value = ''
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (cause) {
    error.value = axios.isAxiosError<{ message?: string }>(cause) ? (cause.response?.data?.message ?? 'Не удалось выполнить запрос.') : 'Не удалось выполнить запрос.'
  } finally { loading.value = false }
}
</script>

<template>
  <main class="login-page"><section class="auth"><form @submit.prevent="submitAuth">
    <input v-model.trim="username" aria-label="Логин" autocomplete="username" minlength="3" placeholder="Логин" required />
    <input v-model="password" aria-label="Пароль" autocomplete="current-password" minlength="6" placeholder="Пароль" required type="password" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="submit" :disabled="loading" type="submit">{{ loading ? 'Входим…' : 'Войти' }}</button>
  </form></section></main>
</template>

<style scoped>
.login-page { display: grid; min-height: 100dvh; place-items: center; padding: 20px; }
.auth { width: min(100%, 360px); padding: 14px; border: 1px solid rgb(255 255 255 / 52%); border-radius: 24px; background: rgb(255 255 255 / 36%); box-shadow: 0 18px 55px rgb(48 55 69 / 13%), inset 0 1px 0 rgb(255 255 255 / 55%); -webkit-backdrop-filter: blur(22px) saturate(145%); backdrop-filter: blur(22px) saturate(145%); }
.auth form { display: grid; gap: 10px; }.auth input { width: 100%; border: 1px solid rgb(255 255 255 / 48%); border-radius: 15px; background: rgb(255 255 255 / 46%); color: inherit; padding: .95rem 1rem; }.auth input::placeholder { color: rgb(54 65 76 / 62%); }.auth input:focus { border-color: rgb(101 117 142 / 70%); outline: 3px solid rgb(124 141 165 / 18%); }
.submit { width: 100%; border: 1px solid rgb(255 255 255 / 40%); border-radius: 15px; background: linear-gradient(135deg, rgb(78 94 113 / 92%), rgb(62 75 91 / 92%)); box-shadow: 0 8px 18px rgb(42 51 63 / 18%), inset 0 1px 0 rgb(255 255 255 / 22%); color: #f8fafc; cursor: pointer; padding: .95rem 1rem; font: inherit; font-weight: 650; }.submit:disabled { cursor: wait; opacity: .7; }.error { margin: 0; color: #b42318; }
@media (min-width: 768px) { .login-page { padding: 48px; }.auth { width: min(100%, 400px); padding: 18px; border-radius: 28px; } }
@media (prefers-color-scheme: dark) { .auth { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 48%); }.auth input { border-color: rgb(255 255 255 / 13%); background: rgb(255 255 255 / 9%); }.auth input::placeholder { color: rgb(235 240 246 / 58%); }.auth input:focus { border-color: rgb(173 191 218 / 58%); outline-color: rgb(174 193 224 / 18%); }.submit { background: linear-gradient(135deg, rgb(129 145 166 / 88%), rgb(91 106 126 / 92%)); } }
</style>
