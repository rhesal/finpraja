<script setup>
import { ref, computed, watch } from 'vue'
import { db } from '../db.js'
import { useLiveQuery } from '../composables/useLiveQuery.js'

const emit = defineEmits(['open-add-modal', 'open-edit-modal'])

const filterType = ref('all')
const selectedDailyDate = ref('')
const searchQuery = ref('')

const periodDate = ref(new Date())
const period = computed(() => {
  const y = periodDate.value.getFullYear()
  const m = String(periodDate.value.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
})
const periodLabel = computed(() =>
  periodDate.value.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
)

function prevMonth() {
  selectedDailyDate.value = ''
  const d = new Date(periodDate.value)
  d.setMonth(d.getMonth() - 1)
  periodDate.value = d
}
function nextMonth() {
  selectedDailyDate.value = ''
  const d = new Date(periodDate.value)
  d.setMonth(d.getMonth() + 1)
  periodDate.value = d
}

watch(selectedDailyDate, (newVal) => {
  if (newVal) {
    const parsed = new Date(newVal)
    if (!isNaN(parsed.getTime())) {
      periodDate.value = parsed
    }
  }
})

const daysInMonth = computed(() => {
  const year = periodDate.value.getFullYear()
  const month = periodDate.value.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days = []
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  for (let i = 1; i <= lastDay; i++) {
    const dateObj = new Date(year, month, i)
    const dayName = dayNames[dateObj.getDay()]
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    days.push({ dateNum: i, dayName, dateStr })
  }
  return days
})

const { data: transactions } = useLiveQuery(() => db.transactions.toArray(), [])
const { data: categories } = useLiveQuery(() => db.categories.toArray(), [])

const filteredTransactions = computed(() => {
  let list = [...transactions.value]
  if (selectedDailyDate.value) {
    list = list.filter(t => t.date === selectedDailyDate.value)
  } else {
    list = list.filter(t => t.date && t.date.startsWith(period.value))
  }
  if (filterType.value !== 'all') {
    list = list.filter(t => t.type === filterType.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(t => {
      const cat = getCategoryById(t.category_id)
      const parentName = getParentCategoryName(cat) || ''
      return (
        (t.note && t.note.toLowerCase().includes(q)) ||
        cat.name.toLowerCase().includes(q) ||
        parentName.toLowerCase().includes(q)
      )
    })
  }
  return list.sort((a, b) => b.id - a.id)
})

function getCategoryById(id) {
  return categories.value.find(c => c.id === id) || { name: 'Tanpa Kategori', icon: 'fa-question' }
}

function getParentCategoryName(cat) {
  if (!cat.parent_id) return null
  const parent = categories.value.find(c => c.id === cat.parent_id)
  return parent ? parent.name : null
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function editTransaction(tx) {
  emit('open-edit-modal', tx)
}

async function deleteTransaction(id) {
  if (confirm('Yakin ingin menghapus transaksi ini?')) {
    await db.transactions.delete(id)
  }
}

function exportFilteredCsv() {
  const list = filteredTransactions.value
  if (list.length === 0) {
    alert('Tidak ada transaksi untuk diekspor.')
    return
  }
  const headers = ['Tanggal', 'Keterangan', 'Jumlah', 'Tipe', 'Kategori']
  const rows = list.map(t => {
    const cat = getCategoryById(t.category_id)
    return [
      t.date,
      `"${(t.note || '').replace(/"/g, '""')}"`,
      t.amount,
      t.type === 'income' ? 'MASUK' : 'KELUAR',
      `"${(cat.name || 'Tanpa Kategori').replace(/"/g, '""')}"`
    ].join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const suffix = selectedDailyDate.value || period.value
  a.download = `finpraja_${suffix}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="px-4 py-5 animate-fade-in space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-white">Riwayat Transaksi</h2>
        <p class="text-xs text-slate-500 mt-0.5">{{ filteredTransactions.length }} transaksi tercatat</p>
      </div>
      <button
        @click="exportFilteredCsv"
        :disabled="filteredTransactions.length === 0"
        class="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        title="Ekspor transaksi yang sedang ditampilkan"
      >
        <i class="fa-solid fa-file-csv text-[10px]"></i>
        Ekspor
      </button>
    </div>

    <!-- Search Bar -->
    <div class="relative">
      <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari catatan atau kategori..."
        class="w-full pl-9 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/40 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
      >
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>

    <div class="flex items-center justify-between px-3 py-2.5 bg-slate-800/40 rounded-xl">
      <button @click="prevMonth" class="w-8 h-8 rounded-lg bg-slate-700/40 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all active:scale-90">
        <i class="fa-solid fa-chevron-left text-xs"></i>
      </button>
      <div class="text-center">
        <p class="text-sm font-bold text-white">{{ periodLabel }}</p>
        <p class="text-[9px] text-slate-500 font-mono">{{ period }}</p>
      </div>
      <button @click="nextMonth" class="w-8 h-8 rounded-lg bg-slate-700/40 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all active:scale-90">
        <i class="fa-solid fa-chevron-right text-xs"></i>
      </button>
    </div>

    <div class="flex overflow-x-auto gap-2 py-2 px-1 scrollbar-none snap-x">
      <button
        @click="selectedDailyDate = ''"
        :class="[
          'flex flex-col items-center justify-center min-w-[56px] h-14 rounded-xl text-center transition-all duration-200 snap-start shrink-0 select-none active:scale-95 border',
          selectedDailyDate === ''
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-500/50 text-white font-bold shadow-lg shadow-emerald-500/25'
            : 'bg-slate-800/30 text-slate-400 border-slate-700/20 hover:bg-slate-850'
        ]"
      >
        <span class="text-[8px] font-bold uppercase tracking-wider mb-0.5" :class="selectedDailyDate === '' ? 'text-emerald-100' : 'text-slate-500'">Hari</span>
        <span class="text-xs font-extrabold">Semua</span>
      </button>

      <button
        v-for="day in daysInMonth"
        :key="day.dateStr"
        @click="selectedDailyDate = day.dateStr"
        :class="[
          'flex flex-col items-center justify-center min-w-[48px] h-14 rounded-xl text-center transition-all duration-200 snap-start shrink-0 select-none active:scale-95 border',
          selectedDailyDate === day.dateStr
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-500/50 text-white font-bold shadow-lg shadow-emerald-500/25'
            : 'bg-slate-800/30 text-slate-400 border-slate-700/20 hover:bg-slate-850'
        ]"
      >
        <span class="text-[8px] font-bold uppercase tracking-wider mb-0.5" :class="selectedDailyDate === day.dateStr ? 'text-emerald-100' : 'text-slate-500'">{{ day.dayName }}</span>
        <span class="text-xs font-extrabold">{{ day.dateNum }}</span>
      </button>
    </div>

    <div class="flex gap-2">
      <button
        v-for="f in [
          { value: 'all', label: 'Semua', icon: 'fa-layer-group' },
          { value: 'income', label: 'Masuk', icon: 'fa-arrow-up' },
          { value: 'expense', label: 'Keluar', icon: 'fa-arrow-down' },
        ]"
        :key="f.value"
        @click="filterType = f.value"
        :class="[
          'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5',
          filterType === f.value
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
            : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
        ]"
      >
        <i :class="['fa-solid', f.icon, 'text-[10px]']"></i>
        {{ f.label }}
      </button>
    </div>

    <div v-if="filteredTransactions.length === 0" class="glass-card p-10 flex flex-col items-center justify-center text-center w-full min-h-[200px] gap-3">
      <div class="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center">
        <i class="fa-solid fa-inbox text-3xl text-slate-600"></i>
      </div>
      <p class="text-sm text-slate-500">Tidak ada transaksi yang cocok.</p>
    </div>

    <div v-else class="space-y-2">
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <div
          v-for="tx in filteredTransactions"
          :key="tx.id"
          class="glass-card px-4 py-3 flex items-center gap-3 group hover:border-slate-600/40 transition-all duration-200"
        >
          <div
            :class="[
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              tx.type === 'income' ? 'bg-emerald-500/15' : 'bg-red-500/15'
            ]"
          >
            <i
              :class="[
                'fa-solid',
                getCategoryById(tx.category_id).icon,
                tx.type === 'income' ? 'text-emerald-400' : 'text-red-400',
                'text-sm'
              ]"
            ></i>
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">{{ getCategoryById(tx.category_id).name }}</p>
            <p class="text-[10px] text-slate-500 truncate">
              <span v-if="getParentCategoryName(getCategoryById(tx.category_id))" class="text-slate-600">
                {{ getParentCategoryName(getCategoryById(tx.category_id)) }} ›
              </span>
              {{ tx.note || '—' }} · {{ formatDate(tx.date) }}
            </p>
          </div>

          <div class="flex items-center gap-1.5">
            <p
              :class="[
                'text-sm font-bold whitespace-nowrap',
                tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'
              ]"
            >
              {{ tx.type === 'income' ? '+' : '-' }}{{ formatRupiah(tx.amount) }}
            </p>
            <button
              @click="editTransaction(tx)"
              class="w-7 h-7 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Edit"
            >
              <i class="fa-solid fa-pen text-[10px]"></i>
            </button>
            <button
              @click="deleteTransaction(tx.id)"
              class="w-7 h-7 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Hapus"
            >
              <i class="fa-solid fa-trash-can text-[10px]"></i>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
.list-move {
  transition: transform 0.3s ease;
}
</style>
