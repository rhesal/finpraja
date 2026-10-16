import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import '@fortawesome/fontawesome-free/css/all.min.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[FinPraja] Service Worker registered:', reg.scope)
      })
      .catch((err) => {
        console.warn('[FinPraja] Service Worker registration failed:', err)
      })
  })
}
