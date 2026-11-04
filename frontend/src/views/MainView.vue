<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { itemsApi, type PlannerItem } from '../lib/api'

const isCreateModalOpen = ref(false)
const itemType = ref<'place' | 'event'>('place')
const link = ref('')
const description = ref('')
const date = ref('')

const items = ref<PlannerItem[]>([])
const loading = ref(false)
const listError = ref(false)
const submitting = ref(false)
const submitError = ref('')
const savedNote = ref(false)

const activeTab = ref<'all' | 'place' | 'event'>('all')

const filteredItems = computed(() => activeTab.value === 'all' ? items.value : items.value.filter(item => item.type === activeTab.value))
const allCount = computed(() => items.value.length)
const placeCount = computed(() => items.value.filter(item => item.type === 'place').length)
const eventCount = computed(() => items.value.filter(item => item.type === 'event').length)
const emptyText = computed(() => activeTab.value === 'place' ? 'Мест пока нет' : activeTab.value === 'event' ? 'Событий пока нет' : 'Пока пусто')

async function loadItems() {
  loading.value = true
  listError.value = false
  try {
    items.value = await itemsApi.list()
  } catch (error) {
    console.error('Failed to load items', error)
    listError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadItems)

function closeModal() {
  isCreateModalOpen.value = false
}

function serverMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data as { message?: string } | undefined
    if (typeof message?.message === 'string' && message.message) return message.message
  }
  return 'Не удалось сохранить'
}

function isValidLink(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function resetForm() {
  itemType.value = 'place'
  link.value = ''
  description.value = ''
  date.value = ''
}

async function submit() {
  submitError.value = ''
  savedNote.value = false

  if (!description.value) {
    submitError.value = 'Добавь описание'
    return
  }
  if (link.value && !isValidLink(link.value)) {
    submitError.value = 'Ссылка должна быть валидным URL'
    return
  }
  if (itemType.value === 'event' && date.value && Number.isNaN(new Date(date.value).getTime())) {
    submitError.value = 'Не получилось разобрать дату'
    return
  }

  const payload = {
    type: itemType.value,
    description: description.value,
    ...(link.value ? { link: link.value } : {}),
    ...(itemType.value === 'event' && date.value ? { date: new Date(date.value).toISOString() } : {}),
  }

  submitting.value = true
  try {
    const created = await itemsApi.create(payload)
    items.value = [created, ...items.value]
    isCreateModalOpen.value = false
    resetForm()
    savedNote.value = true
  } catch (error) {
    console.error('Failed to save item', error)
    submitError.value = serverMessage(error)
  } finally {
    submitting.value = false
  }
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function formatItemDate(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : dateFormatter.format(parsed)
}
</script>

<template>
  <main class="main-page">
    <span class="brand">planer</span>
    <button class="create-button" type="button" aria-label="Создать" @click="isCreateModalOpen = true">+</button>
    <p v-if="savedNote" class="saved-note">Сохранили ✓</p>

    <section class="list" aria-live="polite">
      <div class="tabs" role="group" aria-label="Фильтр записей">
        <button class="tab" type="button" :class="{ tab_active: activeTab === 'all' }" :aria-pressed="activeTab === 'all'" @click="activeTab = 'all'">Все записи · {{ allCount }}</button>
        <button class="tab" type="button" :class="{ tab_active: activeTab === 'place' }" :aria-pressed="activeTab === 'place'" @click="activeTab = 'place'">Места · {{ placeCount }}</button>
        <button class="tab" type="button" :class="{ tab_active: activeTab === 'event' }" :aria-pressed="activeTab === 'event'" @click="activeTab = 'event'">События · {{ eventCount }}</button>
      </div>
      <p v-if="loading" class="list-status">Загружаем…</p>
      <template v-else-if="listError">
        <p class="list-status">Не удалось загрузить список</p>
        <button class="retry-button" type="button" @click="loadItems">Повторить</button>
      </template>
      <p v-else-if="!filteredItems.length" class="list-status empty">{{ emptyText }}</p>
      <ul v-else class="items">
        <li v-for="item in filteredItems" :key="item.id" class="item-card">
          <div class="item-head">
            <span class="item-badge" :class="{ 'item-badge_event': item.type === 'event' }">
              {{ item.type === 'place' ? 'Место' : 'Событие' }}
            </span>
            <span v-if="item.date" class="item-date">{{ formatItemDate(item.date) }}</span>
          </div>
          <p class="item-description">{{ item.description }}</p>
          <a v-if="item.link" class="item-link" :href="item.link" target="_blank" rel="noopener noreferrer">Открыть ссылку ↗</a>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <div v-if="isCreateModalOpen" class="modal-backdrop" @click.self="closeModal">
        <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div class="modal-header">
            <h1 id="create-title">Создать</h1>
            <button class="close-button" type="button" aria-label="Закрыть" @click="closeModal">×</button>
          </div>

          <form class="create-form" @submit.prevent="submit">
            <fieldset>
              <legend>Что создаём?</legend>
              <label class="radio-option"><input v-model="itemType" type="radio" value="place" /><span>Место</span></label>
              <label class="radio-option"><input v-model="itemType" type="radio" value="event" /><span>Событие</span></label>
            </fieldset>

            <label><span>Ссылка</span><input v-model.trim="link" type="url" inputmode="url" autocomplete="url" placeholder="https://" /></label>
            <label><span>Описание</span><textarea v-model.trim="description" rows="4" placeholder="Добавь заметку" /></label>
            <label v-if="itemType === 'event'"><span>Дата</span><input v-model="date" type="datetime-local" /></label>

            <p v-if="submitError" class="form-error">{{ submitError }}</p>
            <button class="submit-button" type="submit" :disabled="submitting">{{ submitting ? 'Сохраняем…' : 'Сохранить' }}</button>
          </form>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.main-page { display: grid; min-height: 100dvh; padding: 20px; place-items: center; }
.brand { position: fixed; top: 20px; left: 20px; font-size: 1.05rem; font-weight: 700; letter-spacing: -.035em; }
.create-button, .close-button { display: grid; border: 1px solid rgb(255 255 255 / 52%); color: inherit; cursor: pointer; place-items: center; }
.create-button { position: fixed; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; background: rgb(255 255 255 / 35%); box-shadow: 0 8px 22px rgb(48 55 69 / 12%), inset 0 1px 0 rgb(255 255 255 / 55%); font-size: 1.7rem; font-weight: 300; line-height: 1; -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.create-button:active { transform: scale(.94); }
.list { display: grid; gap: 12px; width: min(100%, 38rem); justify-self: center; }
.list-status { width: min(100%, 38rem); margin: 0; text-align: center; font-size: clamp(1.25rem, 4vw, 2.25rem); line-height: 1.3; letter-spacing: -.03em; }
.list .list-status.empty { justify-self: center; }
.tabs { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; border: 1px solid rgb(255 255 255 / 52%); border-radius: 999px; background: rgb(250 252 255 / 55%); box-shadow: 0 8px 22px rgb(48 55 69 / 10%), inset 0 1px 0 rgb(255 255 255 / 55%); padding: 5px; -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
.tab { border: 1px solid transparent; border-radius: 999px; background: transparent; color: inherit; cursor: pointer; padding: .5rem 1rem; font-size: .88rem; font-weight: 600; letter-spacing: -.01em; }
.tab:hover { background: rgb(255 255 255 / 35%); }
.tab_active { border-color: rgb(255 255 255 / 60%); background: rgb(255 255 255 / 62%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 60%); }
.retry-button { justify-self: center; border: 1px solid rgb(255 255 255 / 52%); border-radius: 999px; background: rgb(255 255 255 / 35%); color: inherit; cursor: pointer; padding: .55rem 1.2rem; font-weight: 600; -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.saved-note { justify-self: center; margin: 0; border: 1px solid rgb(111 160 132 / 55%); border-radius: 999px; background: rgb(232 246 238 / 70%); padding: .4rem .9rem; font-size: .84rem; font-weight: 600; }
.items { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.item-card { border: 1px solid rgb(255 255 255 / 52%); border-radius: 20px; background: rgb(250 252 255 / 66%); box-shadow: 0 12px 34px rgb(30 38 51 / 14%), inset 0 1px 0 rgb(255 255 255 / 68%); padding: 14px 16px; -webkit-backdrop-filter: blur(20px) saturate(140%); backdrop-filter: blur(20px) saturate(140%); }
.item-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.item-badge { border: 1px solid rgb(101 117 142 / 45%); border-radius: 999px; background: rgb(255 255 255 / 46%); padding: .16rem .6rem; font-size: .72rem; font-weight: 700; letter-spacing: .02em; }
.item-badge_event { border-color: rgb(108 130 186 / 55%); background: rgb(233 239 255 / 70%); }
.item-date { font-size: .82rem; font-weight: 600; color: rgb(64 76 94); }
.item-description { margin: 0; line-height: 1.45; }
.item-link { justify-self: start; margin-top: 8px; font-size: .86rem; font-weight: 600; color: rgb(58 88 146); }
.form-error { margin: 0; border: 1px solid rgb(196 92 92 / 55%); border-radius: 14px; background: rgb(252 236 234 / 70%); padding: .6rem .8rem; font-size: .82rem; font-weight: 600; }
.submit-button { justify-self: start; border: 1px solid rgb(255 255 255 / 52%); border-radius: 999px; background: rgb(255 255 255 / 40%); color: inherit; cursor: pointer; padding: .6rem 1.4rem; font-weight: 700; -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.submit-button:hover { background: rgb(255 255 255 / 58%); }
.submit-button:disabled { opacity: .6; cursor: default; }
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; padding: 20px; background: rgb(24 31 40 / 30%); place-items: center; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.create-modal { width: min(100%, 420px); border: 1px solid rgb(255 255 255 / 52%); border-radius: 24px; background: rgb(250 252 255 / 66%); box-shadow: 0 24px 70px rgb(30 38 51 / 24%), inset 0 1px 0 rgb(255 255 255 / 68%); padding: 18px; -webkit-backdrop-filter: blur(26px) saturate(145%); backdrop-filter: blur(26px) saturate(145%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }.modal-header h1 { margin: 0; font-size: 1.1rem; letter-spacing: -.025em; }.close-button { width: 32px; height: 32px; border-radius: 50%; background: rgb(255 255 255 / 44%); font-size: 1.55rem; font-weight: 300; line-height: 1; }
.create-form { display: grid; gap: 15px; }.create-form label:not(.radio-option), fieldset { display: grid; gap: 7px; }.create-form span, legend { font-size: .84rem; font-weight: 600; }.create-form input:not([type='radio']), textarea { width: 100%; border: 1px solid rgb(255 255 255 / 52%); border-radius: 14px; background: rgb(255 255 255 / 48%); color: inherit; outline: none; padding: .8rem .9rem; resize: vertical; }.create-form input:focus, textarea:focus { border-color: rgb(101 117 142 / 70%); box-shadow: 0 0 0 3px rgb(124 141 165 / 18%); }
fieldset { margin: 0; padding: 0; border: 0; }legend { margin-bottom: 9px; }.radio-option { display: flex; align-items: center; gap: 8px; width: fit-content; cursor: pointer; }.radio-option input { width: 16px; height: 16px; accent-color: #526273; }
@media (min-width: 768px) { .main-page { padding: 48px; }.brand { top: 32px; left: 32px; }.create-button { top: 28px; right: 28px; }.create-modal { padding: 22px; border-radius: 28px; } }
@media (prefers-color-scheme: dark) { .create-button { border-color: rgb(255 255 255 / 15%); background: rgb(28 34 44 / 48%); }.create-modal { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 72%); box-shadow: 0 24px 70px rgb(0 0 0 / 32%), inset 0 1px 0 rgb(255 255 255 / 12%); }.close-button, .create-form input:not([type='radio']), textarea { border-color: rgb(255 255 255 / 13%); background: rgb(255 255 255 / 9%); }.retry-button { border-color: rgb(255 255 255 / 15%); background: rgb(28 34 44 / 48%); }.saved-note { border-color: rgb(121 176 148 / 35%); background: rgb(28 44 38 / 62%); }.form-error { border-color: rgb(220 112 112 / 40%); background: rgb(58 34 34 / 62%); }.submit-button { border-color: rgb(255 255 255 / 15%); background: rgb(255 255 255 / 12%); }.submit-button:hover { background: rgb(255 255 255 / 22%); }.item-card { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 72%); box-shadow: 0 12px 34px rgb(0 0 0 / 26%), inset 0 1px 0 rgb(255 255 255 / 12%); }.item-badge { border-color: rgb(255 255 255 / 18%); background: rgb(255 255 255 / 10%); }.item-badge_event { border-color: rgb(138 162 224 / 40%); background: rgb(46 58 94 / 55%); }.item-date { color: rgb(196 205 218); }.item-link { color: rgb(146 180 240); }.tabs { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 72%); box-shadow: 0 8px 22px rgb(0 0 0 / 22%), inset 0 1px 0 rgb(255 255 255 / 12%); }.tab { color: rgb(196 205 218); }.tab:hover { background: rgb(255 255 255 / 10%); }.tab_active { border-color: rgb(255 255 255 / 22%); background: rgb(255 255 255 / 14%); color: inherit; box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%); } }
</style>
