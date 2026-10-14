import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { setAccessTokenProvider } from './lib/api'
import { pinia } from './pinia'
import router from './router'
import { useAuthStore } from './stores/auth'

setAccessTokenProvider(() => useAuthStore(pinia).accessToken)

createApp(App).use(pinia).use(router).mount('#app')
