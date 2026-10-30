<script setup lang="ts">
import { ref } from 'vue'

const isCreateModalOpen = ref(false)
const itemType = ref<'place' | 'event'>('place')
const link = ref('')
const description = ref('')
const date = ref('')

function closeModal() {
  isCreateModalOpen.value = false
}
</script>

<template>
  <main class="main-page">
    <span class="brand">planer</span>
    <button class="create-button" type="button" aria-label="Создать" @click="isCreateModalOpen = true">+</button>
    <p class="placeholder">это могла бы быть вредоносная ссылка которая похитит твои данные, но в этот раз повезло, тут будет наш планер</p>

    <Teleport to="body">
      <div v-if="isCreateModalOpen" class="modal-backdrop" @click.self="closeModal">
        <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div class="modal-header">
            <h1 id="create-title">Создать</h1>
            <button class="close-button" type="button" aria-label="Закрыть" @click="closeModal">×</button>
          </div>

          <form class="create-form" @submit.prevent>
            <fieldset>
              <legend>Что создаём?</legend>
              <label class="radio-option"><input v-model="itemType" type="radio" value="place" /><span>Место</span></label>
              <label class="radio-option"><input v-model="itemType" type="radio" value="event" /><span>Событие</span></label>
            </fieldset>

            <label><span>Ссылка</span><input v-model.trim="link" type="url" inputmode="url" autocomplete="url" placeholder="https://" /></label>
            <label><span>Описание</span><textarea v-model.trim="description" rows="4" placeholder="Добавь заметку" /></label>
            <label v-if="itemType === 'event'"><span>Дата</span><input v-model="date" type="datetime-local" /></label>
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
.placeholder { width: min(100%, 38rem); margin: 0; text-align: center; font-size: clamp(1.25rem, 4vw, 2.25rem); line-height: 1.3; letter-spacing: -.03em; }
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; padding: 20px; background: rgb(24 31 40 / 30%); place-items: center; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.create-modal { width: min(100%, 420px); border: 1px solid rgb(255 255 255 / 52%); border-radius: 24px; background: rgb(250 252 255 / 66%); box-shadow: 0 24px 70px rgb(30 38 51 / 24%), inset 0 1px 0 rgb(255 255 255 / 68%); padding: 18px; -webkit-backdrop-filter: blur(26px) saturate(145%); backdrop-filter: blur(26px) saturate(145%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }.modal-header h1 { margin: 0; font-size: 1.1rem; letter-spacing: -.025em; }.close-button { width: 32px; height: 32px; border-radius: 50%; background: rgb(255 255 255 / 44%); font-size: 1.55rem; font-weight: 300; line-height: 1; }
.create-form { display: grid; gap: 15px; }.create-form label:not(.radio-option), fieldset { display: grid; gap: 7px; }.create-form span, legend { font-size: .84rem; font-weight: 600; }.create-form input:not([type='radio']), textarea { width: 100%; border: 1px solid rgb(255 255 255 / 52%); border-radius: 14px; background: rgb(255 255 255 / 48%); color: inherit; outline: none; padding: .8rem .9rem; resize: vertical; }.create-form input:focus, textarea:focus { border-color: rgb(101 117 142 / 70%); box-shadow: 0 0 0 3px rgb(124 141 165 / 18%); }
fieldset { margin: 0; padding: 0; border: 0; }legend { margin-bottom: 9px; }.radio-option { display: flex; align-items: center; gap: 8px; width: fit-content; cursor: pointer; }.radio-option input { width: 16px; height: 16px; accent-color: #526273; }
@media (min-width: 768px) { .main-page { padding: 48px; }.brand { top: 32px; left: 32px; }.create-button { top: 28px; right: 28px; }.create-modal { padding: 22px; border-radius: 28px; } }
@media (prefers-color-scheme: dark) { .create-button { border-color: rgb(255 255 255 / 15%); background: rgb(28 34 44 / 48%); }.create-modal { border-color: rgb(255 255 255 / 14%); background: rgb(27 32 42 / 72%); box-shadow: 0 24px 70px rgb(0 0 0 / 32%), inset 0 1px 0 rgb(255 255 255 / 12%); }.close-button, .create-form input:not([type='radio']), textarea { border-color: rgb(255 255 255 / 13%); background: rgb(255 255 255 / 9%); } }
</style>
