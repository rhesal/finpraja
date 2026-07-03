<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { db } from '../db.js'
import { useLiveQuery } from '../composables/useLiveQuery.js'
import { Chart, registerables } from 'chart.js'

// Register Chart.js components
Chart.register(...registerables)

// ── Time / Period Navigation ──
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
  const d = new Date(periodDate.value)
  d.setMonth(d.getMonth() - 1)
  periodDate.value = d
}
function nextMonth() {
  const d = new Date(periodDate.value)
  d.setMonth(d.getMonth() + 1)
  periodDate.value = d
}

// ── Reactive Database Queries ──
const { data: categories } = useLiveQuery(() => db.categories.toArray(), [])
const { data: transactions } = useLiveQuery(() => db.transactions.toArray(), [])
const { data: budgets } = useLiveQuery(() => db.budgets.toArray(), [])

// ── Computed Calculations ──
const filteredTransactions = computed(() => {
  return transactions.value.filter(t => t.date && t.date.startsWith(period.value))
})

const filteredBudgets = computed(() => {
  return budgets.value.filter(b => b.period === period.value)
})

const totalIncome = computed(() => {
  return filteredTransactions.value
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
})

const totalExpense = computed(() => {
  return filteredTransactions.value
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
})

const balance = computed(() => totalIncome.value - totalExpense.value)

const savingRatio = computed(() => {
  if (totalIncome.value === 0) return 0
  return Math.max(0, Math.round((balance.value / totalIncome.value) * 100))
})

// Find parent category for a given ID (sub-categories map to their parent)
function getParentCategory(catId) {
  const cat = categories.value.find(c => c.id === catId)
  if (!cat) return null
  if (cat.parent_id === null) return cat
  return categories.value.find(c => c.id === cat.parent_id) || cat
}

// ── Chart Data Computations ──

// Donut Chart: Expense Distribution per Parent Category
const donutChartData = computed(() => {
  const expenses = filteredTransactions.value.filter(t => t.type === 'expense')
  const groups = {}
  
  expenses.forEach(t => {
    const parent = getParentCategory(t.category_id)
    if (parent) {
      groups[parent.name] = (groups[parent.name] || 0) + t.amount
    } else {
      groups['Lainnya'] = (groups['Lainnya'] || 0) + t.amount
    }
  })

  return {
    labels: Object.keys(groups),
    data: Object.values(groups)
  }
})

// Bar Chart: Budget vs Realization per Parent Category
const barChartData = computed(() => {
  const expenseParents = categories.value.filter(c => c.parent_id === null && c.type === 'expense')
  const labels = []
  const budgetVals = []
  const spentVals = []
  
  expenseParents.forEach(cat => {
    const budgetObj = filteredBudgets.value.find(b => b.category_id === cat.id)
    const budgetAmt = budgetObj ? budgetObj.amount : 0
    
    // Spending includes the parent + all its subcategories
    const subIds = categories.value.filter(c => c.parent_id === cat.id).map(c => c.id)
    const allIds = [cat.id, ...subIds]
    const spentAmt = filteredTransactions.value
      .filter(t => t.type === 'expense' && allIds.includes(t.category_id))
      .reduce((sum, t) => sum + t.amount, 0)
      
    if (budgetAmt > 0 || spentAmt > 0) {
      labels.push(cat.name)
      budgetVals.push(budgetAmt)
      spentVals.push(spentAmt)
    }
  })
  
  return { labels, budgets: budgetVals, spents: spentVals }
})

// Line Chart: Cumulative Daily Spending Trend
const lineChartData = computed(() => {
  const year = periodDate.value.getFullYear()
  const month = periodDate.value.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  
  const dailySpents = Array(lastDay).fill(0)
  
  filteredTransactions.value
    .filter(t => t.type === 'expense')
    .forEach(t => {
      if (t.date) {
        const dayNum = parseInt(t.date.split('-')[2], 10)
        if (dayNum >= 1 && dayNum <= lastDay) {
          dailySpents[dayNum - 1] += t.amount
        }
      }
    })
  
  const cumulative = []
  let sum = 0
  for (let i = 0; i < lastDay; i++) {
    sum += dailySpents[i]
    cumulative.push(sum)
  }
  
  return {
    labels: Array.from({ length: lastDay }, (_, i) => `${i + 1}`),
    data: cumulative
  }
})

// ── Chart.js Instances & Canvas Refs ──
const donutCanvas = ref(null)
const barCanvas = ref(null)
const lineCanvas = ref(null)

let donutChartInstance = null
let barChartInstance = null
let lineChartInstance = null

// Colors matching the Fintech dark premium theme
const colorPalette = {
  emerald: '#10b981',
  emeraldAlpha: 'rgba(16, 185, 129, 0.75)',
  indigo: '#6366f1',
  indigoAlpha: 'rgba(99, 102, 241, 0.75)',
  amber: '#f59e0b',
  amberAlpha: 'rgba(245, 158, 11, 0.75)',
  rose: '#f43f5e',
  roseAlpha: 'rgba(244, 63, 94, 0.75)',
  sky: '#0ea5e9',
  skyAlpha: 'rgba(14, 165, 233, 0.75)',
  purple: '#a855f7',
  purpleAlpha: 'rgba(168, 85, 247, 0.75)',
  violet: '#8b5cf6',
  violetAlpha: 'rgba(139, 92, 246, 0.75)',
  pink: '#ec4899',
  pinkAlpha: 'rgba(236, 72, 153, 0.75)',
  slateDark: '#1e293b',
  slateLight: '#94a3b8',
  slateBorder: 'rgba(148, 163, 184, 0.15)',
  textLight: '#f1f5f9',
}

const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: colorPalette.slateLight,
        font: { family: 'Inter', size: 10, weight: '500' },
        boxWidth: 12,
        padding: 10
      }
    },
    tooltip: {
      backgroundColor: '#0F172A',
      titleColor: colorPalette.textLight,
      bodyColor: colorPalette.slateLight,
      borderColor: 'rgba(148, 163, 184, 0.1)',
      borderWidth: 1,
      padding: 10,
      titleFont: { family: 'Inter', size: 11, weight: 'bold' },
      bodyFont: { family: 'Inter', size: 11 },
      callbacks: {
        label: function (context) {
          let label = context.dataset.label || '';
          if (label) label += ': ';
          if (context.parsed.y !== undefined) {
            label += formatRupiah(context.parsed.y);
          } else if (context.parsed !== undefined) {
            label += formatRupiah(context.parsed);
          }
          return label;
        }
      }
    }
  }
}

// Render or Update the charts
function renderCharts() {
  // 1. Donut Chart
  if (donutCanvas.value) {
    if (donutChartInstance) donutChartInstance.destroy()
    
    const { labels, data } = donutChartData.value
    if (data.length > 0) {
      donutChartInstance = new Chart(donutCanvas.value, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [
              colorPalette.emeraldAlpha,
              colorPalette.indigoAlpha,
              colorPalette.amberAlpha,
              colorPalette.skyAlpha,
              colorPalette.roseAlpha,
              colorPalette.purpleAlpha,
              colorPalette.pinkAlpha
            ],
            borderColor: '#0B0F19',
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          ...defaultChartOptions,
          plugins: {
            ...defaultChartOptions.plugins,
            legend: {
              ...defaultChartOptions.plugins.legend,
              position: 'right'
            }
          },
          cutout: '70%'
        }
      })
    }
  }

  // 2. Bar Chart
  if (barCanvas.value) {
    if (barChartInstance) barChartInstance.destroy()
    
    const { labels, budgets: budgetVals, spents: spentVals } = barChartData.value
    if (labels.length > 0) {
      // Dynamic color: highlight in red if over budget
      const spentColors = spentVals.map((spent, idx) => {
        const budget = budgetVals[idx]
        return (budget > 0 && spent > budget) ? colorPalette.roseAlpha : colorPalette.emeraldAlpha
      })
      const spentBorders = spentVals.map((spent, idx) => {
        const budget = budgetVals[idx]
        return (budget > 0 && spent > budget) ? colorPalette.rose : colorPalette.emerald
      })

      barChartInstance = new Chart(barCanvas.value, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Anggaran',
              data: budgetVals,
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              borderColor: 'rgba(148, 163, 184, 0.4)',
              borderWidth: 1.5,
              borderRadius: 4
            },
            {
              label: 'Realisasi',
              data: spentVals,
              backgroundColor: spentColors,
              borderColor: spentBorders,
              borderWidth: 1.5,
              borderRadius: 4
            }
          ]
        },
        options: {
          ...defaultChartOptions,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colorPalette.slateLight, font: { family: 'Inter', size: 9 } }
            },
            y: {
              grid: { color: colorPalette.slateBorder },
              ticks: {
                color: colorPalette.slateLight,
                font: { family: 'Inter', size: 9 },
                callback: value => 'Rp ' + (value >= 1e6 ? (value / 1e6) + 'jt' : value >= 1e3 ? (value / 1e3) + 'rb' : value)
              }
            }
          }
        }
      })
    }
  }

  // 3. Line Chart
  if (lineCanvas.value) {
    if (lineChartInstance) lineChartInstance.destroy()
    
    const { labels, data } = lineChartData.value
    const hasSpending = data.some(val => val > 0)
    
    if (hasSpending) {
      // Get context to create gradient
      const ctx = lineCanvas.value.getContext('2d')
      const gradient = ctx.createLinearGradient(0, 0, 0, 180)
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)')
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)')

      lineChartInstance = new Chart(lineCanvas.value, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Akumulasi Pengeluaran',
            data,
            fill: true,
            backgroundColor: gradient,
            borderColor: colorPalette.emerald,
            borderWidth: 2.5,
            pointBackgroundColor: colorPalette.emerald,
            pointBorderColor: '#0B0F19',
            pointBorderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.3
          }]
        },
        options: {
          ...defaultChartOptions,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colorPalette.slateLight, font: { family: 'Inter', size: 9 }, maxTicksLimit: 10 }
            },
            y: {
              grid: { color: colorPalette.slateBorder },
              ticks: {
                color: colorPalette.slateLight,
                font: { family: 'Inter', size: 9 },
                callback: value => 'Rp ' + (value >= 1e6 ? (value / 1e6) + 'jt' : value >= 1e3 ? (value / 1e3) + 'rb' : value)
              }
            }
          }
        }
      })
    }
  }
}

// Watch data arrays and period changes to re-draw charts
watch(
  [donutChartData, barChartData, lineChartData],
  () => {
    nextTick(() => {
      renderCharts()
    })
  },
  { deep: true }
)

onMounted(() => {
  // Let initial queries load and UI stabilize before rendering
  setTimeout(() => {
    renderCharts()
  }, 100)
})

onUnmounted(() => {
  if (donutChartInstance) donutChartInstance.destroy()
  if (barChartInstance) barChartInstance.destroy()
  if (lineChartInstance) lineChartInstance.destroy()
})

// Format helpers
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
</script>

<template>
  <div class="px-4 py-5 animate-fade-in space-y-5">
    
    <!-- ── Header ── -->
    <div>
      <h2 class="text-lg font-bold text-white">Grafik & Laporan</h2>
      <p class="text-xs text-slate-500 mt-0.5">Analisis visual keuangan offline</p>
    </div>

    <!-- ── Period Navigator ── -->
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

    <!-- ── Summary Panel ── -->
    <div class="grid grid-cols-3 gap-2.5">
      <div class="glass-card p-3 flex flex-col justify-between">
        <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Masuk</span>
        <span class="text-xs font-bold text-emerald-400 mt-1 truncate">{{ formatRupiah(totalIncome) }}</span>
      </div>
      <div class="glass-card p-3 flex flex-col justify-between">
        <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Keluar</span>
        <span class="text-xs font-bold text-red-400 mt-1 truncate">{{ formatRupiah(totalExpense) }}</span>
      </div>
      <div class="glass-card p-3 flex flex-col justify-between">
        <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Tabungan</span>
        <span class="text-xs font-bold text-amber-400 mt-1 flex items-center gap-1">
          <span>{{ savingRatio }}%</span>
          <span class="text-[9px] text-slate-500 font-normal">rate</span>
        </span>
      </div>
    </div>

    <!-- ── Chart 1: Donut (Expense Distribution) ── -->
    <div class="glass-card p-4">
      <h3 class="text-xs font-bold text-white mb-3 uppercase tracking-wider text-slate-300">
        <i class="fa-solid fa-chart-pie mr-1.5 text-emerald-400"></i>Distribusi Pengeluaran
      </h3>
      
      <div class="relative h-44 flex items-center justify-center">
        <canvas v-if="donutChartData.data.length > 0" ref="donutCanvas"></canvas>
        
        <!-- Empty State -->
        <div v-else class="flex flex-col items-center justify-center text-center w-full h-full gap-2">
          <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <i class="fa-solid fa-receipt text-slate-600"></i>
          </div>
          <p class="text-xs text-slate-500">Tidak ada pengeluaran di bulan ini.</p>
        </div>
      </div>
    </div>

    <!-- ── Chart 2: Bar (Budget vs Realization) ── -->
    <div class="glass-card p-4">
      <h3 class="text-xs font-bold text-white mb-3 uppercase tracking-wider text-slate-300">
        <i class="fa-solid fa-chart-column mr-1.5 text-indigo-400"></i>Anggaran vs Realisasi
      </h3>
      
      <div class="relative h-48 flex items-center justify-center">
        <canvas v-if="barChartData.labels.length > 0" ref="barCanvas"></canvas>
        
        <!-- Empty State -->
        <div v-else class="flex flex-col items-center justify-center text-center w-full h-full gap-2">
          <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <i class="fa-solid fa-wallet text-slate-600"></i>
          </div>
          <p class="text-xs text-slate-500">Tidak ada anggaran atau transaksi untuk dibanding.</p>
        </div>
      </div>
    </div>

    <!-- ── Chart 3: Line (Cumulative Spending Trend) ── -->
    <div class="glass-card p-4">
      <h3 class="text-xs font-bold text-white mb-3 uppercase tracking-wider text-slate-300">
        <i class="fa-solid fa-chart-line mr-1.5 text-amber-400"></i>Tren Pengeluaran Harian
      </h3>
      
      <div class="relative h-48 flex items-center justify-center">
        <canvas v-if="lineChartData.data.some(val => val > 0)" ref="lineCanvas"></canvas>
        
        <!-- Empty State -->
        <div v-else class="flex flex-col items-center justify-center text-center w-full h-full gap-2">
          <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <i class="fa-solid fa-timeline text-slate-600"></i>
          </div>
          <p class="text-xs text-slate-500">Belum ada riwayat transaksi harian.</p>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Ensure charts take up full width of card */
canvas {
  width: 100% !important;
  height: 100% !important;
}
</style>
