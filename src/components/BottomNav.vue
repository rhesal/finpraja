<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const emit = defineEmits(['add-click'])

const route = useRoute()
const router = useRouter()

const navItems = [
  { name: 'home',         label: 'Beranda',     icon: 'fa-house',     path: '/' },
  { name: 'transactions', label: 'Transaksi',   icon: 'fa-list',      path: '/transactions' },
  { name: 'fab',          label: '',             icon: '',             path: '' },
  { name: 'reports',      label: 'Laporan',     icon: 'fa-chart-pie', path: '/reports' },
  { name: 'settings',     label: 'Pengaturan',  icon: 'fa-gear',      path: '/settings' },
]

const currentRoute = computed(() => route.name)

function navigate(item) {
  if (item.name === 'fab') {
    emit('add-click')
  } else {
    router.push(item.path)
  }
}
</script>

<template>
  <nav class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
    <!-- Glass background -->
    <div class="bg-dark-950/90 backdrop-blur-2xl border-t border-slate-800/60">
      <div class="flex items-end justify-around px-2 pt-1 pb-2 safe-area-pb">
        <template v-for="item in navItems" :key="item.name">
          <!-- FAB Center Button -->
          <div v-if="item.name === 'fab'" class="flex flex-col items-center -mt-5">
            <button
              @click="navigate(item)"
              class="fab-button glow-emerald"
              aria-label="Tambah Transaksi"
            >
              <i class="fa-solid fa-plus text-lg"></i>
            </button>
          </div>

          <!-- Regular Nav Item -->
          <button
            v-else
            @click="navigate(item)"
            :class="['nav-item', { active: currentRoute === item.name }]"
          >
            <i :class="['fa-solid', item.icon, 'text-base']"></i>
            <span class="text-[10px] font-medium">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.safe-area-pb {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}
</style>
