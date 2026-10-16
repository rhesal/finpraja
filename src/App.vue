<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { initDatabase } from './db.js'
import BottomNav from './components/BottomNav.vue'
import AddTransactionModal from './components/AddTransactionModal.vue'
import DbStatusBadge from './components/DbStatusBadge.vue'

const router = useRouter()
const route = useRoute()

const dbStatus = ref({ connected: false, loading: true })
const showAddModal = ref(false)
const editingTransaction = ref(null)

onMounted(async () => {
  try {
    const status = await initDatabase()
    dbStatus.value = { ...status, loading: false }
  } catch (err) {
    dbStatus.value = { connected: false, error: err.message, loading: false }
  }
})

function openAddModal() {
  editingTransaction.value = null
  showAddModal.value = true
}

function openEditModal(tx) {
  editingTransaction.value = tx
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
  editingTransaction.value = null
}
</script>

<template>
  <div class="min-h-screen bg-[#070A12] flex justify-center">
    <div class="w-full max-w-md relative min-h-screen flex flex-col bg-dark-950">
      <div class="sticky top-0 z-40 bg-dark-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <i class="fa-solid fa-wallet text-white text-sm"></i>
            </div>
            <div>
              <h1 class="text-base font-bold text-white tracking-tight leading-none">FinPraja</h1>
              <p class="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Keuangan ASN</p>
            </div>
          </div>
          <DbStatusBadge :status="dbStatus" />
        </div>
      </div>

      <main class="flex-1 overflow-y-auto pb-24">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" :db-status="dbStatus" @open-add-modal="openAddModal" @open-edit-modal="openEditModal" />
          </transition>
        </router-view>
      </main>

      <BottomNav @add-click="openAddModal" />

      <AddTransactionModal
        :show="showAddModal"
        :edit-transaction="editingTransaction"
        @close="closeAddModal"
      />
    </div>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
