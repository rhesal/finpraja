<script setup>
import { computed } from 'vue'
import { db, getCurrentPeriod } from '../db.js'
import { useLiveQuery } from '../composables/useLiveQuery.js'

const emit = defineEmits(['open-add-modal'])
const props = defineProps({
  dbStatus: { type: Object, default: () => ({}) },
})

// ── Reactive live queries ──
const currentPeriod = getCurrentPeriod()
const { data: categories } = useLiveQuery(() => db.categories.toArray(), [])
const { data: transactions } = useLiveQuery(() => db.transactions.toArray(), [])
const { data: budgets } = useLiveQuery(() => db.budgets.where('period').equals(currentPeriod).toArray(), [])

// ── Computed values ──
const currentMonth = new Date().toISOString().slice(0, 7)

const monthTransactions = computed(() =>
  transactions.value.filter(t => t.date && t.date.startsWith(currentMonth))
)

const totalIncome = computed(() =>
  monthTransactions.value
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
)

const totalExpense = computed(() =>
  monthTransactions.value
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
)

const balance = computed(() => totalIncome.value - totalExpense.value)

const recentTransactions = computed(() =>
  [...transactions.value].sort((a, b) => b.id - a.id).slice(0, 5)
)

// ── Budget calculations ──
const parentExpenseCategories = computed(() =>
  categories.value.filter(c => c.parent_id === null && c.type === 'expense')
)

// Get all sub-category IDs for a parent
function getSubCategoryIds(parentId) {
  return categories.value
    .filter(c => c.parent_id === parentId)
    .map(c => c.id)
}

// Calculate spending for a category (including its sub-categories)
function getCategorySpending(categoryId) {
  const subIds = getSubCategoryIds(categoryId)
  const allIds = [categoryId, ...subIds]
  return monthTransactions.value
    .filter(t => t.type === 'expense' && allIds.includes(t.category_id))
    .reduce((sum, t) => sum + t.amount, 0)
}

const budgetUsages = computed(() => {
  return budgets.value
    .filter(b => b.amount > 0)
    .map(budget => {
      const cat = categories.value.find(c => c.id === budget.category_id)
      if (!cat) return null
      const spent = getCategorySpending(budget.category_id)
      const pct = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0
      return {
        category: cat,
        budget: budget.amount,
        spent,
        percentage: pct,
        barWidth: Math.min(pct, 100),
        isOver: pct >= 100,
        colorClass: pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500',
        textClass: pct >= 100 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400',
        bgClass: pct >= 100 ? 'bg-red-500/10' : pct >= 70 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
      }
    })
    .filter(Boolean)
})

const totalBudget = computed(() =>
  budgets.value.reduce((sum, b) => sum + (b.amount || 0), 0)
)

const totalBudgetedSpending = computed(() => {
  const budgetedCatIds = budgets.value.map(b => b.category_id)
  let total = 0
  for (const catId of budgetedCatIds) {
    total += getCategorySpending(catId)
  }
  return total
})

const remainingBudget = computed(() => totalBudget.value - totalBudgetedSpending.value)

// ── Helpers ──
function getCategoryById(id) {
  return categories.value.find(c => c.id === id) || { name: 'Tanpa Kategori', icon: 'fa-question' }
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
    day: 'numeric',
    month: 'short',
  })
}

const currentMonthName = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
</script>

<template>
  <div class="px-4 py-5 space-y-5 animate-fade-in">

    <!-- ── Balance Card ── -->
    <div class="gradient-card p-5 glow-emerald">
      <!-- Decorative circles -->
      <div class="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/5 blur-2xl"></div>
      <div class="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-indigo-500/5 blur-2xl"></div>

      <div class="relative z-10">
        <p class="text-xs text-slate-400 font-medium mb-1">
          <i class="fa-regular fa-calendar mr-1"></i>{{ currentMonthName }}
        </p>
        <p class="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Saldo Bulan Ini</p>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">
          {{ formatRupiah(balance) }}
        </h2>

        <div class="flex gap-4 mt-4">
          <!-- Income -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <i class="fa-solid fa-arrow-up text-emerald-400 text-xs"></i>
            </div>
            <div>
              <p class="text-[10px] text-slate-500 font-medium">Pemasukan</p>
              <p class="text-sm font-bold text-emerald-400">{{ formatRupiah(totalIncome) }}</p>
            </div>
          </div>

          <!-- Expense -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
              <i class="fa-solid fa-arrow-down text-red-400 text-xs"></i>
            </div>
            <div>
              <p class="text-[10px] text-slate-500 font-medium">Pengeluaran</p>
              <p class="text-sm font-bold text-red-400">{{ formatRupiah(totalExpense) }}</p>
            </div>
          </div>
        </div>

        <!-- Budget Remaining Summary -->
        <div v-if="totalBudget > 0" class="mt-3 pt-3 border-t border-slate-700/30">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-wallet text-amber-400 text-[10px]"></i>
              <span class="text-[10px] text-slate-400 font-medium">Sisa Anggaran</span>
            </div>
            <span :class="['text-sm font-bold', remainingBudget >= 0 ? 'text-amber-400' : 'text-red-400']">
              {{ formatRupiah(remainingBudget) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Quick Actions ── -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-white">Aksi Cepat</h3>
      </div>
      <div class="grid grid-cols-3 gap-2.5">
        <button
          @click="$emit('open-add-modal')"
          class="glass-card p-3 flex flex-col items-center gap-2 hover:border-emerald-500/30 transition-all active:scale-95"
        >
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <i class="fa-solid fa-plus text-emerald-400"></i>
          </div>
          <span class="text-[10px] font-semibold text-slate-400">Catat</span>
        </button>

        <button
          @click="$router.push('/transactions')"
          class="glass-card p-3 flex flex-col items-center gap-2 hover:border-indigo-500/30 transition-all active:scale-95"
        >
          <div class="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <i class="fa-solid fa-list text-indigo-400"></i>
          </div>
          <span class="text-[10px] font-semibold text-slate-400">Riwayat</span>
        </button>

        <button
          @click="$router.push('/reports')"
          class="glass-card p-3 flex flex-col items-center gap-2 hover:border-amber-500/30 transition-all active:scale-95"
        >
          <div class="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <i class="fa-solid fa-chart-pie text-amber-400"></i>
          </div>
          <span class="text-[10px] font-semibold text-slate-400">Laporan</span>
        </button>
      </div>
    </div>

    <!-- ── Budget Usage Section ── -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-white">Penggunaan Anggaran</h3>
        <span class="status-badge bg-slate-800 text-slate-400 text-[9px]">
          <i class="fa-regular fa-calendar text-[8px]"></i>
          {{ currentMonthName }}
        </span>
      </div>

      <!-- No budgets -->
      <div v-if="budgetUsages.length === 0" class="glass-card p-5 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-wallet text-amber-400/60"></i>
        </div>
        <div>
          <p class="text-xs text-slate-400">Belum ada anggaran.</p>
          <button @click="$router.push('/settings')" class="text-[10px] text-emerald-400 font-semibold hover:text-emerald-300 mt-0.5">
            Atur di Pengaturan <i class="fa-solid fa-chevron-right text-[8px] ml-0.5"></i>
          </button>
        </div>
      </div>

      <!-- Budget bars -->
      <div v-else class="space-y-2.5">
        <div
          v-for="usage in budgetUsages"
          :key="usage.category.id"
          class="glass-card px-4 py-3"
        >
          <!-- Top row: icon + name + amounts -->
          <div class="flex items-center gap-2.5 mb-2">
            <div :class="['w-8 h-8 rounded-lg flex items-center justify-center shrink-0', usage.bgClass]">
              <i :class="['fa-solid', usage.category.icon, usage.textClass, 'text-xs']"></i>
            </div>
            <span class="text-xs font-semibold text-white flex-1 truncate">{{ usage.category.name }}</span>
            <div class="text-right shrink-0">
              <span class="text-[10px] text-slate-400">
                {{ formatRupiah(usage.spent) }}
                <span class="text-slate-600"> / </span>
                {{ formatRupiah(usage.budget) }}
              </span>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="flex items-center gap-2">
            <div class="flex-1 h-2 rounded-full bg-slate-800/80 overflow-hidden">
              <div
                :class="['h-full rounded-full transition-all duration-500 ease-out', usage.colorClass]"
                :style="{ width: usage.barWidth + '%' }"
              ></div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span :class="['text-[10px] font-bold tabular-nums', usage.textClass]">
                {{ usage.percentage }}%
              </span>
              <span
                v-if="usage.isOver"
                class="text-[8px] font-bold uppercase bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full"
              >OVER</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Recent Transactions ── -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-white">Transaksi Terakhir</h3>
        <button @click="$router.push('/transactions')" class="text-[10px] text-emerald-400 font-semibold hover:text-emerald-300 transition-colors">
          Lihat Semua <i class="fa-solid fa-chevron-right text-[8px] ml-0.5"></i>
        </button>
      </div>

      <div v-if="recentTransactions.length === 0" class="glass-card p-8 flex flex-col items-center gap-3">
        <div class="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center">
          <i class="fa-solid fa-receipt text-2xl text-slate-600"></i>
        </div>
        <p class="text-sm text-slate-500 text-center">Belum ada transaksi.<br/>Ketuk <span class="text-emerald-400 font-semibold">+</span> untuk memulai!</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="tx in recentTransactions"
          :key="tx.id"
          class="glass-card px-4 py-3 flex items-center gap-3 hover:border-slate-600/40 transition-all"
        >
          <!-- Icon -->
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

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">{{ getCategoryById(tx.category_id).name }}</p>
            <p class="text-[10px] text-slate-500">{{ tx.note || '—' }} · {{ formatDate(tx.date) }}</p>
          </div>

          <!-- Amount -->
          <p
            :class="[
              'text-sm font-bold whitespace-nowrap',
              tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'
            ]"
          >
            {{ tx.type === 'income' ? '+' : '-' }}{{ formatRupiah(tx.amount) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
