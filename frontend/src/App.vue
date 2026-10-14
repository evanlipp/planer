<script setup lang="ts">
import { ref } from 'vue'

const title = ref('Мой план на сегодня')
const tasks = ref([
  { id: 1, text: 'Настроить авторизацию', done: true },
  { id: 2, text: 'Создать первую задачу', done: false },
])

function toggle(id: number) {
  const task = tasks.value.find((item) => item.id === id)
  if (task) task.done = !task.done
}
</script>

<template>
  <main>
    <p class="eyebrow">PLANER</p>
    <h1>{{ title }}</h1>
    <section>
      <label v-for="task in tasks" :key="task.id" :class="{ done: task.done }">
        <input :checked="task.done" type="checkbox" @change="toggle(task.id)" />
        {{ task.text }}
      </label>
    </section>
    <p class="hint">Vue готов. Следующий шаг — подключить задачи к Nest API.</p>
  </main>
</template>

<style scoped>
main { max-width: 640px; margin: 12vh auto; padding: 0 24px; font-family: Inter, system-ui, sans-serif; color: #1d2830; }
.eyebrow { color: #5d6bff; font-size: .75rem; font-weight: 800; letter-spacing: .12em; }
h1 { font-size: clamp(2rem, 6vw, 4rem); margin: 0 0 2rem; }
section { display: grid; gap: 12px; }
label { background: #f3f5f7; border-radius: 12px; padding: 16px; cursor: pointer; }
input { margin-right: 10px; accent-color: #5d6bff; }
.done { color: #73808c; text-decoration: line-through; }
.hint { color: #73808c; margin-top: 2rem; }
</style>
