<template>
  <main class="main-page">
    <span class="brand">planer</span>
    <p>это могла бы быть вредоносная ссылка, но в этот раз повезло, тут будет наш планер:)</p>
  </main>
</template>

<style scoped>
.main-page { display: grid; min-height: 100dvh; padding: 20px; place-items: center; }.brand { position: fixed; top: 20px; left: 20px; font-size: 1.05rem; font-weight: 700; letter-spacing: -.035em; }p { width: min(100%, 38rem); margin: 0; text-align: center; font-size: clamp(1.25rem, 4vw, 2.25rem); line-height: 1.3; letter-spacing: -.03em; }@media (min-width: 768px) { .main-page { padding: 48px; }.brand { top: 32px; left: 32px; } }
</style>
