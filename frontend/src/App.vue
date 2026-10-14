<script setup lang="ts">
import { onMounted, ref } from 'vue'
import axios from 'axios'
import { authApi, type AuthResponse } from './lib/api'

const username = ref('')
const password = ref('')
const account = ref<AuthResponse['user'] | null>(null)
const error = ref('')
const loading = ref(false)

async function submitAuth() {
  error.value = ''
  if (username.value.trim().length < 3 || password.value.length < 6) {
    error.value = 'Логин должен содержать минимум 3 символа, пароль — минимум 6.'
    return
  }

  loading.value = true
  try {
    const response = await authApi.login({ username: username.value.trim(), password: password.value })
    account.value = response.user
    password.value = ''
  } catch (cause) {
    error.value = axios.isAxiosError<{ message?: string }>(cause)
      ? (cause.response?.data?.message ?? 'Не удалось выполнить запрос.')
      : 'Не удалось выполнить запрос.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const response = await authApi.restore()
    account.value = response.user
  } catch {
    // An absent or expired refresh cookie simply means the visitor is signed out.
  }
})
</script>

<template>
  <main v-if="account" class="home-page">
    <span class="brand">planer</span>
  </main>
  <main v-else class="login-page">
    <section class="auth">
      <form @submit.prevent="submitAuth">
        <input v-model.trim="username" aria-label="Логин" autocomplete="username" minlength="3" placeholder="Логин" required />
        <input v-model="password" aria-label="Пароль" autocomplete="current-password" minlength="6" placeholder="Пароль" required type="password" />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="submit" :disabled="loading" type="submit">{{ loading ? 'Входим…' : 'Войти' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
main { font-family: Inter, system-ui, sans-serif; color: #1d2830; }
.home-page { min-height: 100dvh; padding: 20px; }
.brand { font-size: 1.05rem; font-weight: 700; letter-spacing: -.035em; }
.login-page { box-sizing: border-box; display: grid; min-height: 100dvh; width: 100%; max-width: none; margin: 0; place-items: center; padding: 20px; }
.auth {
  width: min(100%, 360px);
  padding: 14px;
  border: 1px solid rgb(255 255 255 / 52%);
  border-radius: 24px;
  background: rgb(255 255 255 / 36%);
  box-shadow: 0 18px 55px rgb(48 55 69 / 13%), inset 0 1px 0 rgb(255 255 255 / 55%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  backdrop-filter: blur(22px) saturate(145%);
}
.auth form { display: grid; gap: 10px; }
.auth input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgb(255 255 255 / 48%);
  border-radius: 15px;
  background: rgb(255 255 255 / 46%);
  color: inherit;
  padding: .95rem 1rem;
  box-shadow: inset 0 1px 2px rgb(30 40 56 / 5%);
}
.auth input::placeholder { color: rgb(54 65 76 / 62%); }
.auth input:focus { border-color: rgb(101 117 142 / 70%); outline: 3px solid rgb(124 141 165 / 18%); }
button { border: 0; border-radius: 8px; cursor: pointer; padding: .65rem .9rem; }
.submit {
  width: 100%;
  border: 1px solid rgb(255 255 255 / 40%);
  border-radius: 15px;
  background: linear-gradient(135deg, rgb(78 94 113 / 92%), rgb(62 75 91 / 92%));
  box-shadow: 0 8px 18px rgb(42 51 63 / 18%), inset 0 1px 0 rgb(255 255 255 / 22%);
  color: #f8fafc;
  padding: .95rem 1rem;
  font: inherit;
  font-weight: 650;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.submit:not(:disabled):active { transform: scale(.985); box-shadow: 0 3px 10px rgb(42 51 63 / 18%), inset 0 1px 0 rgb(255 255 255 / 18%); }
.submit:disabled { cursor: wait; opacity: .7; }
.error { color: #b42318; margin: 0; }

@media (min-width: 768px) {
  .login-page { padding: 48px; }
  .auth { width: min(100%, 400px); padding: 18px; border-radius: 28px; }
  .home-page { padding: 32px; }
}

@media (prefers-color-scheme: dark) {
  .auth { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 48%); box-shadow: 0 18px 55px rgb(0 0 0 / 24%), inset 0 1px 0 rgb(255 255 255 / 12%); }
  .auth input { border-color: rgb(255 255 255 / 13%); background: rgb(255 255 255 / 9%); }
  .auth input::placeholder { color: rgb(235 240 246 / 58%); }
  .auth input:focus { border-color: rgb(173 191 218 / 58%); outline-color: rgb(174 193 224 / 18%); }
  .submit { background: linear-gradient(135deg, rgb(129 145 166 / 88%), rgb(91 106 126 / 92%)); }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .auth { background: rgb(248 249 251 / 92%); }
}
</style>
