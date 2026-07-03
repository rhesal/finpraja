<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { db, seedCategories, upsertBudget, getBudgetsByPeriod, getCurrentPeriod } from '../db.js'

// ── Data ──
const categories = ref([])
const transactionCount = ref(0)
const dbSize = ref('—')
const budgetAmounts = ref({})  // { categoryId: amount }
const budgetSaving = ref(false)
const budgetSaved = ref(false)

// ── CSV Import State ──
const csvInputRef = ref(null)
const csvLoading = ref(false)
const csvFeedback = ref(null)

// ── JSON Backup State ──
const restoreInputRef = ref(null)
const backupLoading = ref(false)
const backupFeedback = ref(null)

// ── Period navigation ──
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

// ── Computed categories ──
const parentIncomeCategories = computed(() =>
  categories.value.filter(c => c.type === 'income' && c.parent_id === null)
)
const parentExpenseCategories = computed(() =>
  categories.value.filter(c => c.type === 'expense' && c.parent_id === null)
)

function getSubsOf(parentId) {
  return categories.value.filter(c => c.parent_id === parentId)
}

// Budget total
const totalBudget = computed(() =>
  Object.values(budgetAmounts.value).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)
)

// ── Load data ──
async function loadData() {
  categories.value = await db.categories.toArray()
  transactionCount.value = await db.transactions.count()

  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate()
    const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2)
    const quotaMB = ((estimate.quota || 0) / 1024 / 1024).toFixed(0)
    dbSize.value = `${usedMB} MB / ${quotaMB} MB`
  }
}

async function loadBudgets() {
  const existing = await getBudgetsByPeriod(period.value)
  const map = {}
  for (const b of existing) {
    map[b.category_id] = b.amount
  }
  budgetAmounts.value = map
}

watch(period, () => {
  loadBudgets()
})

onMounted(async () => {
  await loadData()
  await loadBudgets()
})

// ── Budget save ──
async function saveBudgets() {
  budgetSaving.value = true
  try {
    const promises = []
    for (const cat of parentExpenseCategories.value) {
      const amt = parseInt(budgetAmounts.value[cat.id], 10) || 0
      if (amt > 0) {
        promises.push(upsertBudget(cat.id, period.value, amt))
      }
    }
    await Promise.all(promises)
    budgetSaved.value = true
    setTimeout(() => { budgetSaved.value = false }, 2000)
  } catch (err) {
    console.error('[FinPraja] Error saving budgets:', err)
  } finally {
    budgetSaving.value = false
  }
}

// ── CSV Import ──
function triggerCsvInput() {
  if (!csvLoading.value) {
    csvFeedback.value = null
    csvInputRef.value?.click()
  }
}

async function onCsvFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  csvLoading.value = true
  csvFeedback.value = null

  const reader = new FileReader()
  reader.onload = async (event) => {
    try {
      const csvText = event.target.result
      const result = await processCsvData(csvText)
      csvFeedback.value = {
        success: true,
        message: `Berhasil mengimpor ${result.inserted} transaksi baru (${result.skipped} diabaikan/duplikat).`
      }
      await loadData()
    } catch (err) {
      console.error('[FinPraja] CSV Import Error:', err)
      csvFeedback.value = {
        success: false,
        message: 'Gagal memproses file CSV. Periksa format kolom.'
      }
    } finally {
      csvLoading.value = false
      if (csvInputRef.value) {
        csvInputRef.value.value = ''
      }
    }
  }
  reader.readAsText(file)
}

async function processCsvData(csvText) {
  const lines = csvText.split(/\r?\n/)
  if (lines.length <= 1) {
    throw new Error('CSV is empty')
  }

  let startIdx = 0
  if (lines[0].toUpperCase().includes('TANGGAL') || lines[0].toUpperCase().includes('DATE')) {
    startIdx = 1
  }

  const categoriesList = await db.categories.toArray()
  const defaultIncome = categoriesList.find(c => c.name === 'Gaji Pokok') || { id: 1 }
  const defaultExpense = categoriesList.find(c => c.name === 'Konsumsi & Makanan') || { id: 6 }

  function matchCategory(desc, type) {
    const d = desc.toUpperCase()
    for (const cat of categoriesList) {
      if (cat.type === type && d.includes(cat.name.toUpperCase())) {
        return cat.id
      }
    }
    if (type === 'expense') {
      if (d.includes('MAKAN') || d.includes('KULINER') || d.includes('WARUNG') || d.includes('RESTO')) {
        return categoriesList.find(c => c.name.includes('Konsumsi'))?.id || defaultExpense.id
      }
      if (d.includes('BENSIN') || d.includes('GRAB') || d.includes('GOJEK') || d.includes('PARKIR')) {
        return categoriesList.find(c => c.name.includes('Transportasi'))?.id || defaultExpense.id
      }
      if (d.includes('BPJS') || d.includes('TASPEN') || d.includes('IURAN') || d.includes('KORPRI')) {
        return categoriesList.find(c => c.name.includes('Iuran') || c.name.includes('Potongan'))?.id || defaultExpense.id
      }
    } else {
      if (d.includes('GAJI') || d.includes('SALARY')) {
        return categoriesList.find(c => c.name.includes('Gaji'))?.id || defaultIncome.id
      }
      if (d.includes('TUKIN') || d.includes('TPP')) {
        return categoriesList.find(c => c.name.includes('Tukin') || c.name.includes('TPP'))?.id || defaultIncome.id
      }
    }
    return type === 'income' ? defaultIncome.id : defaultExpense.id
  }

  const existingTx = await db.transactions.toArray()
  const makeKey = (date, amount, note) => `${date}|${amount}|${(note || '').trim().toUpperCase()}`
  const existingKeys = new Set(existingTx.map(t => makeKey(t.date, t.amount, t.note)))

  let skippedCount = 0
  const toInsert = []

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    if (cols.length < 4) {
      skippedCount++
      continue
    }

    const rawDate = cols[0].replace(/"/g, '').trim()
    const rawDesc = cols[1].replace(/"/g, '').trim()
    const rawAmt = cols[2].replace(/"/g, '').trim()
    const rawType = cols[3].replace(/"/g, '').trim().toUpperCase()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      skippedCount++
      continue
    }

    const amount = parseInt(rawAmt, 10)
    if (isNaN(amount) || amount <= 0) {
      skippedCount++
      continue
    }

    let type = 'expense'
    if (rawType === 'MASUK' || rawType === 'INCOME' || rawType === 'PEMASUKAN') {
      type = 'income'
    }

    const key = makeKey(rawDate, amount, rawDesc)
    if (existingKeys.has(key)) {
      skippedCount++
      continue
    }

    const category_id = matchCategory(rawDesc, type)

    toInsert.push({
      amount,
      type,
      category_id,
      date: rawDate,
      note: rawDesc
    })
    existingKeys.add(key)
  }

  if (toInsert.length > 0) {
    await db.transactions.bulkAdd(toInsert)
  }

  return { inserted: toInsert.length, skipped: skippedCount }
}

// ── Format helpers ──
function formatBudgetInput(catId) {
  const val = budgetAmounts.value[catId]
  if (!val || val === 0) return ''
  return parseInt(val, 10).toLocaleString('id-ID')
}

function onBudgetInput(e, catId) {
  const raw = e.target.value.replace(/\D/g, '')
  const num = parseInt(raw, 10) || 0
  budgetAmounts.value[catId] = num
  e.target.value = num > 0 ? num.toLocaleString('id-ID') : ''
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Reset ──
async function resetDatabase() {
  if (confirm('⚠️ Hapus semua data? Kategori default akan dimuat ulang.')) {
    await db.transactions.clear()
    await db.categories.clear()
    await db.budgets.clear()
    await seedCategories()
    await loadData()
    await loadBudgets()
  }
}

// ── JSON Backup & Restore ──
async function exportData() {
  backupFeedback.value = null
  try {
    const allTransactions = await db.transactions.toArray()
    const allBudgets = await db.budgets.toArray()
    const allCategories = await db.categories.toArray()
    
    const backup = {
      app: 'FinPraja',
      exportedAt: new Date().toISOString(),
      categories: allCategories,
      budgets: allBudgets,
      transactions: allTransactions
    }
    
    const jsonStr = JSON.stringify(backup, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finpraja_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    backupFeedback.value = {
      success: true,
      message: 'Ekspor data berhasil! Berkas cadangan diunduh.'
    }
  } catch (err) {
    console.error('[FinPraja] Export Error:', err)
    backupFeedback.value = {
      success: false,
      message: 'Gagal mengekspor data.'
    }
  }
}

function triggerRestoreInput() {
  if (!backupLoading.value) {
    backupFeedback.value = null
    restoreInputRef.value?.click()
  }
}

async function onRestoreFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const confirmMsg = '⚠️ Anda akan memulihkan data.\n\nTindakan ini akan MENGHAPUS SEMUA DATA transaksi, anggaran, dan kategori saat ini di IndexedDB Anda untuk diganti dengan data dari berkas cadangan. Lanjutkan?'
  if (!confirm(confirmMsg)) {
    if (restoreInputRef.value) restoreInputRef.value.value = ''
    return
  }

  backupLoading.value = true
  backupFeedback.value = null

  const reader = new FileReader()
  reader.onload = async (event) => {
    try {
      const jsonText = event.target.result
      const backup = JSON.parse(jsonText)

      // Validation
      if (
        backup.app !== 'FinPraja' || 
        !Array.isArray(backup.categories) || 
        !Array.isArray(backup.budgets) || 
        !Array.isArray(backup.transactions)
      ) {
        throw new Error('Format file cadangan tidak valid.')
      }

      // Overwrite IndexedDB
      await db.transaction('rw', db.transactions, db.budgets, db.categories, async () => {
        await db.transactions.clear()
        await db.budgets.clear()
        await db.categories.clear()

        if (backup.categories.length > 0) {
          await db.categories.bulkAdd(backup.categories)
        }
        if (backup.budgets.length > 0) {
          await db.budgets.bulkAdd(backup.budgets)
        }
        if (backup.transactions.length > 0) {
          await db.transactions.bulkAdd(backup.transactions)
        }
      })

      backupFeedback.value = {
        success: true,
        message: `Pemulihan data berhasil! ${backup.transactions.length} transaksi, ${backup.budgets.length} anggaran, dan ${backup.categories.length} kategori telah dipulihkan.`
      }

      await loadData()
      await loadBudgets()
    } catch (err) {
      console.error('[FinPraja] Restore Error:', err)
      backupFeedback.value = {
        success: false,
        message: 'Gagal memulihkan cadangan. Berkas tidak valid.'
      }
    } finally {
      backupLoading.value = false
      if (restoreInputRef.value) {
        restoreInputRef.value.value = ''
      }
    }
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="px-4 py-5 animate-fade-in space-y-5">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-bold text-white">Pengaturan</h2>
      <p class="text-xs text-slate-500 mt-0.5">Konfigurasi, anggaran & verifikasi database</p>
    </div>

    <!-- ── DB Info Card ── -->
    <div class="glass-card p-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <i class="fa-solid fa-database text-emerald-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Database Lokal</p>
          <p class="text-[10px] text-slate-500">IndexedDB via Dexie.js</p>
        </div>
      </div>

      <div class="space-y-2.5">
        <div class="flex justify-between items-center px-3 py-2 bg-slate-800/40 rounded-lg">
          <span class="text-xs text-slate-400">Status</span>
          <span class="text-xs font-semibold text-emerald-400">
            <i class="fa-solid fa-circle text-[6px] mr-1"></i>Connected (Offline)
          </span>
        </div>
        <div class="flex justify-between items-center px-3 py-2 bg-slate-800/40 rounded-lg">
          <span class="text-xs text-slate-400">Nama Database</span>
          <span class="text-xs font-semibold text-slate-300">FinPrajaDB</span>
        </div>
        <div class="flex justify-between items-center px-3 py-2 bg-slate-800/40 rounded-lg">
          <span class="text-xs text-slate-400">Transaksi Tercatat</span>
          <span class="text-xs font-semibold text-slate-300">{{ transactionCount }}</span>
        </div>
        <div class="flex justify-between items-center px-3 py-2 bg-slate-800/40 rounded-lg">
          <span class="text-xs text-slate-400">Kategori Aktif</span>
          <span class="text-xs font-semibold text-slate-300">{{ categories.length }}</span>
        </div>
        <div class="flex justify-between items-center px-3 py-2 bg-slate-800/40 rounded-lg">
          <span class="text-xs text-slate-400">Penyimpanan</span>
          <span class="text-xs font-semibold text-slate-300">{{ dbSize }}</span>
        </div>
      </div>
    </div>

    <!-- ── Seeded Categories with Sub-Categories ── -->
    <div class="glass-card p-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <i class="fa-solid fa-tags text-indigo-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Kategori ASN</p>
          <p class="text-[10px] text-slate-500">Kategori & sub-kategori bawaan</p>
        </div>
        <div class="ml-auto status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <i class="fa-solid fa-check text-[8px]"></i>
          <span class="text-[10px] font-semibold">LOADED</span>
        </div>
      </div>

      <!-- Income categories -->
      <div class="mb-4">
        <p class="text-[10px] text-emerald-400 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
          <i class="fa-solid fa-arrow-up text-[8px]"></i>Pemasukan ({{ parentIncomeCategories.length }})
        </p>
        <div class="space-y-1">
          <template v-for="cat in parentIncomeCategories" :key="cat.id">
            <div class="flex items-center gap-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <div class="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <i :class="['fa-solid', cat.icon, 'text-emerald-400 text-[10px]']"></i>
              </div>
              <span class="text-xs text-slate-300 font-medium flex-1">{{ cat.name }}</span>
              <span class="text-[9px] text-slate-600 font-mono">id:{{ cat.id }}</span>
            </div>
            <!-- Sub-categories -->
            <div
              v-for="sub in getSubsOf(cat.id)"
              :key="sub.id"
              class="flex items-center gap-2.5 ml-5 pl-3 py-1.5 border-l-2 border-emerald-500/15"
            >
              <div class="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
                <i :class="['fa-solid', sub.icon, 'text-emerald-400/60 text-[8px]']"></i>
              </div>
              <span class="text-[11px] text-slate-400 flex-1">{{ sub.name }}</span>
              <span class="text-[8px] text-slate-700 font-mono">id:{{ sub.id }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Expense categories -->
      <div>
        <p class="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
          <i class="fa-solid fa-arrow-down text-[8px]"></i>Pengeluaran ({{ parentExpenseCategories.length }})
        </p>
        <div class="space-y-1">
          <template v-for="cat in parentExpenseCategories" :key="cat.id">
            <div class="flex items-center gap-3 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-lg">
              <div class="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                <i :class="['fa-solid', cat.icon, 'text-red-400 text-[10px]']"></i>
              </div>
              <span class="text-xs text-slate-300 font-medium flex-1">{{ cat.name }}</span>
              <span class="text-[9px] text-slate-600 font-mono">id:{{ cat.id }}</span>
            </div>
            <!-- Sub-categories -->
            <div
              v-for="sub in getSubsOf(cat.id)"
              :key="sub.id"
              class="flex items-center gap-2.5 ml-5 pl-3 py-1.5 border-l-2 border-red-500/15"
            >
              <div class="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center">
                <i :class="['fa-solid', sub.icon, 'text-red-400/60 text-[8px]']"></i>
              </div>
              <span class="text-[11px] text-slate-400 flex-1">{{ sub.name }}</span>
              <span class="text-[8px] text-slate-700 font-mono">id:{{ sub.id }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Budget Management ── -->
    <div class="glass-card p-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <i class="fa-solid fa-wallet text-amber-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Anggaran Bulanan</p>
          <p class="text-[10px] text-slate-500">Kelola batas pengeluaran per kategori</p>
        </div>
      </div>

      <!-- Period navigator -->
      <div class="flex items-center justify-between px-3 py-2.5 bg-slate-800/40 rounded-xl mb-4">
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

      <!-- Total summary -->
      <div class="flex items-center justify-between px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg mb-4">
        <span class="text-xs text-amber-400 font-medium">
          <i class="fa-solid fa-calculator text-[10px] mr-1"></i>Total Anggaran
        </span>
        <span class="text-sm font-bold text-amber-400">{{ formatRupiah(totalBudget) }}</span>
      </div>

      <!-- Category budget inputs -->
      <div class="space-y-2 mb-4">
        <div
          v-for="cat in parentExpenseCategories"
          :key="'budget-' + cat.id"
          class="flex items-center gap-3 px-3 py-2.5 bg-slate-800/30 rounded-xl"
        >
          <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <i :class="['fa-solid', cat.icon, 'text-red-400/70 text-[10px]']"></i>
          </div>
          <span class="text-xs text-slate-300 font-medium flex-1 truncate">{{ cat.name }}</span>
          <div class="relative w-28 shrink-0">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-semibold">Rp</span>
            <input
              type="text"
              inputmode="numeric"
              placeholder="0"
              :value="formatBudgetInput(cat.id)"
              @input="(e) => onBudgetInput(e, cat.id)"
              class="w-full pl-8 pr-2 py-2 bg-slate-900/60 border border-slate-700/30 rounded-lg text-right text-xs text-white font-semibold placeholder:text-slate-700 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
            />
          </div>
        </div>
      </div>

      <!-- Save button -->
      <button
        @click="saveBudgets"
        :disabled="budgetSaving"
        :class="[
          'w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98]',
          budgetSaved
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400',
          budgetSaving ? 'opacity-50 cursor-not-allowed' : ''
        ]"
      >
        <template v-if="budgetSaved">
          <i class="fa-solid fa-check mr-2"></i>Anggaran Tersimpan!
        </template>
        <template v-else-if="budgetSaving">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i>Menyimpan…
        </template>
        <template v-else>
          <i class="fa-solid fa-floppy-disk mr-2"></i>Simpan Anggaran
        </template>
      </button>
    </div>

    <!-- ── CSV Import Card ── -->
    <div class="glass-card p-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
          <i class="fa-solid fa-file-csv text-sky-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Impor Mutasi Rekening (CSV)</p>
          <p class="text-[10px] text-slate-500">Unggah file CSV mutasi rekening Anda</p>
        </div>
      </div>

      <!-- Import CSV Info -->
      <div class="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3 mb-4 text-slate-400 space-y-1">
        <p class="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Format Kolom CSV:</p>
        <p class="text-[10px]">Kolom harus berurutan: <code class="text-sky-400">Tanggal</code>, <code class="text-sky-400">Deskripsi</code>, <code class="text-sky-400">Nominal</code>, <code class="text-sky-400">Tipe</code></p>
        <ul class="text-[9px] list-disc list-inside pl-1 space-y-0.5">
          <li>Tanggal: Format <code class="text-slate-300">YYYY-MM-DD</code></li>
          <li>Nominal: Angka tanpa titik/koma (e.g. <code class="text-slate-300">50000</code>)</li>
          <li>Tipe: <code class="text-emerald-400 font-semibold">Masuk</code> (Pemasukan) atau <code class="text-red-400 font-semibold">Keluar</code> (Pengeluaran)</li>
        </ul>
      </div>

      <!-- CSV File Input / Drop-zone -->
      <div
        @click="triggerCsvInput"
        class="border border-dashed border-slate-700/60 hover:border-sky-500/50 bg-slate-800/10 hover:bg-slate-800/20 rounded-xl p-6 text-center cursor-pointer mb-4 transition-all duration-200"
      >
        <input
          type="file"
          ref="csvInputRef"
          accept=".csv"
          class="hidden"
          @change="onCsvFileChange"
        />
        <div class="flex flex-col items-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up text-2xl text-slate-500 group-hover:text-sky-400"></i>
          <div>
            <p class="text-xs font-semibold text-white">
              {{ csvLoading ? 'Memproses CSV...' : 'Pilih File CSV Mutasi' }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">Ketuk untuk memilih file .csv lokal</p>
          </div>
        </div>
      </div>

      <!-- Import feedback -->
      <div v-if="csvFeedback" class="text-center p-2.5 bg-slate-800/50 border border-slate-700/40 rounded-xl animate-fade-in">
        <p class="text-xs font-semibold" :class="csvFeedback.success ? 'text-emerald-400' : 'text-red-400'">
          <i :class="['fa-solid', csvFeedback.success ? 'fa-circle-check' : 'fa-circle-exclamation', 'mr-1']"></i>
          {{ csvFeedback.message }}
        </p>
      </div>
    </div>

    <!-- ── JSON Backup & Restore Card (NEW) ── -->
    <div class="glass-card p-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <i class="fa-solid fa-shield-halved text-emerald-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Keamanan & Cadangan Data</p>
          <p class="text-[10px] text-slate-500">Pencadangan & pemulihan database (JSON)</p>
        </div>
      </div>

      <p class="text-[11px] text-slate-400 leading-relaxed mb-4">
        Semua data disimpan 100% lokal di perangkat Anda. Cadangkan data Anda secara berkala untuk menghindari kehilangan catatan keuangan akibat pembersihan cache browser.
      </p>

      <div class="flex gap-2">
        <!-- Export Button -->
        <button
          @click="exportData"
          class="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/60 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <i class="fa-solid fa-download text-xs text-emerald-400"></i>
          <span>Ekspor Data</span>
        </button>

        <!-- Restore Button -->
        <button
          @click="triggerRestoreInput"
          :disabled="backupLoading"
          class="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/60 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
        >
          <input
            type="file"
            ref="restoreInputRef"
            accept=".json"
            class="hidden"
            @change="onRestoreFileChange"
          />
          <i v-if="!backupLoading" class="fa-solid fa-upload text-xs text-indigo-400"></i>
          <span v-else class="loading loading-spinner loading-xs text-indigo-400"></span>
          <span>{{ backupLoading ? 'Memulihkan...' : 'Pulihkan Data' }}</span>
        </button>
      </div>

      <!-- Backup feedback message -->
      <div v-if="backupFeedback" class="mt-3 text-center p-2.5 bg-slate-800/50 border border-slate-700/40 rounded-xl animate-fade-in">
        <p class="text-xs font-semibold" :class="backupFeedback.success ? 'text-emerald-400' : 'text-red-400'">
          <i :class="['fa-solid', backupFeedback.success ? 'fa-circle-check' : 'fa-circle-exclamation', 'mr-1']"></i>
          {{ backupFeedback.message }}
        </p>
      </div>
    </div>

    <!-- ── Danger Zone ── -->
    <div class="glass-card p-4 border-red-500/10">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
          <i class="fa-solid fa-triangle-exclamation text-red-400"></i>
        </div>
        <div>
          <p class="text-sm font-bold text-white">Zona Berbahaya</p>
          <p class="text-[10px] text-slate-500">Reset semua data</p>
        </div>
      </div>
      <button
        @click="resetDatabase"
        class="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 active:scale-[0.98] transition-all"
      >
        <i class="fa-solid fa-trash-can mr-1.5"></i>Reset Database
      </button>
    </div>

    <!-- Version info -->
    <div class="text-center pb-4">
      <p class="text-[10px] text-slate-600">FinPraja v0.4.0 · Fase 4 · 100% Offline</p>
    </div>
  </div>
</template>
