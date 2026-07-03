<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { db } from '../db.js'
import Tesseract from 'tesseract.js'

const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

// ── State ──
const allCategories = ref([])
const subCategories = ref([])
const selectedParentId = ref(null)
const selectedSubId = ref(null)
const saving = ref(false)
const success = ref(false)
const amountDisplay = ref('')
const amountInputRef = ref(null)

// OCR state
const fileInputRef = ref(null)
const ocrLoading = ref(false)

const form = ref({
  type: 'expense',
  amount: 0,
  note: '',
  date: new Date().toISOString().split('T')[0],
})

// ── Computed ──
const parentCategories = computed(() =>
  allCategories.value.filter(c => c.parent_id === null && c.type === form.value.type)
)

const finalCategoryId = computed(() =>
  selectedSubId.value || selectedParentId.value
)

const canSave = computed(() =>
  form.value.amount > 0 && finalCategoryId.value && !saving.value
)

// ── Watchers ──
watch(() => props.show, async (newVal) => {
  if (newVal) {
    allCategories.value = await db.categories.toArray()
    resetForm()
    await nextTick()
    amountInputRef.value?.focus()
  }
})

watch(() => form.value.type, () => {
  selectedParentId.value = null
  selectedSubId.value = null
  subCategories.value = []
})

watch(selectedParentId, async (parentId) => {
  selectedSubId.value = null
  if (parentId) {
    subCategories.value = await db.categories
      .where('parent_id')
      .equals(parentId)
      .toArray()
  } else {
    subCategories.value = []
  }
})

// ── Methods ──
function formatCurrency(num) {
  if (!num || num === 0) return ''
  return num.toLocaleString('id-ID')
}

function onAmountInput(e) {
  const raw = e.target.value.replace(/\D/g, '')
  const num = parseInt(raw, 10) || 0
  form.value.amount = num
  amountDisplay.value = num > 0 ? formatCurrency(num) : ''
  e.target.value = amountDisplay.value
}

function selectParent(catId) {
  if (selectedParentId.value === catId) {
    selectedParentId.value = null
  } else {
    selectedParentId.value = catId
  }
}

function selectSub(subId) {
  selectedSubId.value = selectedSubId.value === subId ? null : subId
}

function resetForm() {
  form.value = {
    type: form.value.type,
    amount: 0,
    note: '',
    date: new Date().toISOString().split('T')[0],
  }
  amountDisplay.value = ''
  selectedParentId.value = null
  selectedSubId.value = null
  subCategories.value = []
}

async function saveTransaction() {
  if (!canSave.value) return
  saving.value = true
  try {
    await db.transactions.add({
      amount: form.value.amount,
      type: form.value.type,
      category_id: finalCategoryId.value,
      date: form.value.date,
      note: form.value.note,
    })
    success.value = true
    setTimeout(() => {
      success.value = false
      resetForm()
      emit('close')
    }, 1000)
  } catch (err) {
    console.error('[FinPraja] Error saving transaction:', err)
  } finally {
    saving.value = false
  }
}

function triggerFileInput() {
  if (!ocrLoading.value) {
    fileInputRef.value?.click()
  }
}

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  ocrLoading.value = true
  try {
    const result = await Tesseract.recognize(file, 'ind+eng', {
      logger: m => console.log('[Tesseract]', m.status, Math.round(m.progress * 100) + '%')
    })
    const text = result.data.text
    console.log("Raw OCR Text:", text)
    
    const amount = extractAmountFromText(text)
    if (amount > 0) {
      form.value.amount = amount
      amountDisplay.value = formatCurrency(amount)
    }
  } catch (err) {
    console.error('[Tesseract] OCR Error:', err)
  } finally {
    ocrLoading.value = false
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

function extractAmountFromText(text) {
  const lines = text.toUpperCase().split('\n')
  
  // 1. Strict Line Matching based on priority keywords
  const priorityPatterns = [
    { key: 'TOTAL', regex: /\bTOTAL\b/ },
    { key: 'JUMLAH', regex: /\bJUMLAH\b/ },
    { key: 'SUBTOTAL', regex: /\bSUBTOTAL\b/ },
    { key: 'BAYAR', regex: /\bBAYAR\b/ }
  ]
  
  for (const pattern of priorityPatterns) {
    for (const line of lines) {
      if (pattern.regex.test(line)) {
        // Exclude lines containing cash handed over or change
        if (
          line.includes('BAYAR CASH') || 
          line.includes('KEMBALI') || 
          line.includes('TUNAI') || 
          line.includes('CASH') || 
          line.includes('KEMBALIAN')
        ) {
          continue
        }
        
        // Double-protection check: TOTAL line cannot contain SUBTOTAL or DISKON
        if (pattern.key === 'TOTAL') {
          if (line.includes('SUBTOTAL') || line.includes('DISKON') || line.includes('DISCOUNT')) {
            continue
          }
        }
        
        // Extract numbers from this line using regex
        const matches = line.match(/\d+(?:[.,]\d{3})*(?:[.,]\d{2})?/g)
        if (matches) {
          const vals = []
          for (const m of matches) {
            let cleaned = m
            if (cleaned.endsWith(',00') || cleaned.endsWith('.00')) {
              cleaned = cleaned.slice(0, -3)
            }
            cleaned = cleaned.replace(/\D/g, '')
            const val = parseInt(cleaned, 10)
            if (val >= 1000 && val < 100000000) {
              vals.push(val)
            }
          }
          if (vals.length > 0) {
            console.log(`[OCR] Matched pattern "${pattern.key}" on line: "${line.trim()}" -> value:`, Math.max(...vals))
            return Math.max(...vals)
          }
        }
      }
    }
  }
  
  // 2. Fallback Safe: If no priority keyword line matched
  // Look through the whole text for numbers >= 1000
  const allMatches = text.match(/\d+(?:[.,]\d{3})*(?:[.,]\d{2})?/g)
  if (allMatches) {
    const allVals = allMatches.map(m => {
      let cleaned = m
      if (cleaned.endsWith(',00') || cleaned.endsWith('.00')) {
        cleaned = cleaned.slice(0, -3)
      }
      return parseInt(cleaned.replace(/\D/g, ''), 10)
    }).filter(v => v >= 1000 && v < 100000000)
    
    if (allVals.length > 0) {
      // Sort descending unique values
      const uniqueVals = [...new Set(allVals)].sort((a, b) => b - a)
      console.log("[OCR] Fallback candidate values (sorted unique):", uniqueVals)
      
      if (uniqueVals.length >= 2) {
        // Ignore the absolute largest number if it is likely to be a round payment (e.g. Rp 100.000)
        console.log("[OCR] Fallback selected 2nd largest:", uniqueVals[1])
        return uniqueVals[1]
      } else {
        console.log("[OCR] Fallback selected only value:", uniqueVals[0])
        return uniqueVals[0]
      }
    }
  }
  
  return 0
}

function close() {
  success.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <div
        v-if="show"
        class="fixed inset-0 z-[60] flex items-end justify-center"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close"></div>

        <!-- Modal Sheet -->
        <Transition name="modal-sheet">
          <div
            v-if="show"
            class="relative w-full max-w-md bg-[#0F1629] rounded-t-3xl border-t border-slate-700/40 z-10 max-h-[85vh] flex flex-col"
          >
            <!-- Handle bar -->
            <div class="flex justify-center pt-3 pb-1 shrink-0">
              <div class="w-10 h-1 rounded-full bg-slate-600"></div>
            </div>

            <!-- Success overlay -->
            <div
              v-if="success"
              class="absolute inset-0 bg-[#0F1629] rounded-t-3xl flex flex-col items-center justify-center gap-3 z-20 animate-fade-in"
            >
              <div class="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center animate-scale-in">
                <i class="fa-solid fa-check text-3xl text-emerald-400"></i>
              </div>
              <p class="text-emerald-400 font-semibold">Transaksi Tersimpan!</p>
            </div>

            <!-- Scrollable content -->
            <div class="overflow-y-auto flex-1 px-5 pb-8 pt-2">
              <!-- Header -->
              <div class="flex items-center justify-between mb-5">
                <h2 class="text-lg font-bold text-white">Tambah Transaksi</h2>
                <button @click="close" class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                  <i class="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>

              <!-- Scan Struk OCR Area -->
              <div class="mb-5">
                <div
                  @click="triggerFileInput"
                  class="relative overflow-hidden group cursor-pointer border border-dashed border-slate-700/60 hover:border-emerald-500/50 bg-slate-800/20 hover:bg-slate-800/40 rounded-xl p-4 flex items-center gap-3 transition-all duration-200"
                >
                  <input
                    type="file"
                    ref="fileInputRef"
                    accept="image/*"
                    class="hidden"
                    @change="onFileChange"
                  />
                  <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform duration-200 shrink-0">
                    <i v-if="!ocrLoading" class="fa-solid fa-camera text-base"></i>
                    <span v-else class="loading loading-spinner loading-xs text-emerald-400"></span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {{ ocrLoading ? 'Memindai struk...' : 'Kamera / Unggah Struk Belanja' }}
                    </p>
                    <p class="text-[10px] text-slate-500 truncate">
                      {{ ocrLoading ? 'Memproses OCR lokal...' : 'Nominal terisi otomatis dari struk' }}
                    </p>
                  </div>
                  <i class="fa-solid fa-chevron-right text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors"></i>
                </div>
              </div>

              <!-- ① Type Toggle -->
              <div class="flex gap-2 p-1 bg-slate-800/60 rounded-xl mb-5">
                <button
                  @click="form.type = 'expense'"
                  :class="[
                    'flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                    form.type === 'expense'
                      ? 'bg-red-500/20 text-red-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-300'
                  ]"
                >
                  <i class="fa-solid fa-arrow-down mr-1.5"></i>Pengeluaran
                </button>
                <button
                  @click="form.type = 'income'"
                  :class="[
                    'flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                    form.type === 'income'
                      ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-300'
                  ]"
                >
                  <i class="fa-solid fa-arrow-up mr-1.5"></i>Pemasukan
                </button>
              </div>

              <!-- ② Amount Input (Large & Bold) -->
              <div class="mb-5">
                <label class="text-xs text-slate-400 font-medium mb-2 block">Jumlah</label>
                <div class="relative">
                  <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg font-bold">Rp</span>
                  <input
                    ref="amountInputRef"
                    type="text"
                    inputmode="numeric"
                    placeholder="0"
                    :value="amountDisplay"
                    @input="onAmountInput"
                    class="w-full pl-14 pr-4 py-4 bg-slate-800/60 border border-slate-700/40 rounded-2xl text-white text-2xl font-extrabold placeholder:text-slate-700 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all tracking-tight"
                  />
                </div>
              </div>

              <!-- ③ Category Grid -->
              <div class="mb-4">
                <label class="text-xs text-slate-400 font-medium mb-2.5 block">Pilih Kategori</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="cat in parentCategories"
                    :key="cat.id"
                    @click="selectParent(cat.id)"
                    :class="[
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 active:scale-95',
                      selectedParentId === cat.id
                        ? form.type === 'income'
                          ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                          : 'bg-red-500/15 border-red-500/40 shadow-sm shadow-red-500/10'
                        : 'bg-slate-800/40 border-slate-700/20 hover:border-slate-600/50'
                    ]"
                  >
                    <div
                      :class="[
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                        selectedParentId === cat.id
                          ? form.type === 'income' ? 'bg-emerald-500/25' : 'bg-red-500/25'
                          : 'bg-slate-700/40'
                      ]"
                    >
                      <i
                        :class="[
                          'fa-solid', cat.icon, 'text-sm',
                          selectedParentId === cat.id
                            ? form.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                            : 'text-slate-400'
                        ]"
                      ></i>
                    </div>
                    <span
                      :class="[
                        'text-[10px] font-semibold text-center leading-tight',
                        selectedParentId === cat.id ? 'text-white' : 'text-slate-400'
                      ]"
                    >{{ cat.name }}</span>
                  </button>
                </div>
              </div>

              <!-- ④ Sub-Category Picker (dynamic) -->
              <Transition name="sub-slide">
                <div v-if="subCategories.length > 0" class="mb-5">
                  <label class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2 block">
                    <i class="fa-solid fa-chevron-right text-[8px] mr-1"></i>Sub-Kategori (opsional)
                  </label>
                  <div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                    <button
                      v-for="sub in subCategories"
                      :key="sub.id"
                      @click="selectSub(sub.id)"
                      :class="[
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border whitespace-nowrap shrink-0 transition-all duration-200 text-xs font-medium',
                        selectedSubId === sub.id
                          ? form.type === 'income'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'bg-red-500/15 border-red-500/40 text-red-400'
                          : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:border-slate-600/50'
                      ]"
                    >
                      <i :class="['fa-solid', sub.icon, 'text-[10px]']"></i>
                      {{ sub.name }}
                    </button>
                  </div>
                </div>
              </Transition>

              <!-- ⑤ Date & Note Row -->
              <div class="grid grid-cols-5 gap-2.5 mb-5">
                <div class="col-span-2">
                  <label class="text-xs text-slate-400 font-medium mb-1.5 block">Tanggal</label>
                  <input
                    type="date"
                    v-model="form.date"
                    class="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/40 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
                <div class="col-span-3">
                  <label class="text-xs text-slate-400 font-medium mb-1.5 block">Catatan</label>
                  <input
                    type="text"
                    v-model="form.note"
                    placeholder="Opsional…"
                    class="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/40 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>

              <!-- ⑥ Save Button -->
              <button
                @click="saveTransaction"
                :disabled="!canSave"
                class="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed"
              >
                <i class="fa-solid fa-check mr-2"></i>Simpan Transaksi
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop-enter-active,
.modal-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.modal-backdrop-enter-from,
.modal-backdrop-leave-to {
  opacity: 0;
}
.modal-sheet-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-sheet-leave-active {
  transition: transform 0.2s ease-in;
}
.modal-sheet-enter-from,
.modal-sheet-leave-to {
  transform: translateY(100%);
}
/* Sub-category slide animation */
.sub-slide-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sub-slide-leave-active {
  transition: all 0.15s ease-in;
}
.sub-slide-enter-from,
.sub-slide-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}
.sub-slide-enter-to,
.sub-slide-leave-from {
  max-height: 100px;
}
/* Hide scrollbar for sub-category horizontal scroll */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
