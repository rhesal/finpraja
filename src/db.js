import Dexie from 'dexie';

export const db = new Dexie('FinPrajaDB');

// ── Schema Version 2: Added sub-categories & updated budgets ──
db.version(1).stores({
  transactions: '++id, amount, type, category_id, date, note',
  categories:   '++id, name, type, icon, parent_id',
  budgets:      '++id, category_id, amount, month_year',
});

db.version(2).stores({
  transactions: '++id, amount, type, category_id, date, note',
  categories:   '++id, name, type, icon, parent_id',
  budgets:      '++id, [category_id+period], category_id, amount, period',
}).upgrade(async tx => {
  // Migrate budgets: rename month_year -> period
  const oldBudgets = await tx.table('budgets').toArray();
  await tx.table('budgets').clear();
  for (const b of oldBudgets) {
    await tx.table('budgets').add({
      category_id: b.category_id,
      amount: b.amount,
      period: b.month_year || b.period,
    });
  }
});

// ── Default ASN Categories (with sub-categories) ──
const DEFAULT_CATEGORIES = [
  // === PEMASUKAN (income) — Parent IDs: 1-5 ===
  { name: 'Gaji Pokok',            type: 'income',  icon: 'fa-money-bill-wave', parent_id: null },
  { name: 'Tukin / TPP',           type: 'income',  icon: 'fa-award',           parent_id: null },
  { name: 'Uang Makan',            type: 'income',  icon: 'fa-utensils',        parent_id: null },
  { name: 'Uang Lembur',           type: 'income',  icon: 'fa-clock',           parent_id: null },
  { name: 'Honorarium Kegiatan',   type: 'income',  icon: 'fa-briefcase',       parent_id: null },

  // === PENGELUARAN (expense) — Parent IDs: 6-12 ===
  { name: 'Konsumsi & Makanan',        type: 'expense', icon: 'fa-bowl-food',     parent_id: null },   // id 6
  { name: 'Transportasi Harian',       type: 'expense', icon: 'fa-car',           parent_id: null },   // id 7
  { name: 'Keperluan Dinas',           type: 'expense', icon: 'fa-shirt',         parent_id: null },   // id 8
  { name: 'Iuran & Potongan',          type: 'expense', icon: 'fa-shield-heart',  parent_id: null },   // id 9
  { name: 'Tabungan & Investasi',      type: 'expense', icon: 'fa-piggy-bank',    parent_id: null },   // id 10
  { name: 'Kebutuhan Rumah Tangga',    type: 'expense', icon: 'fa-house',         parent_id: null },   // id 11
  { name: 'Hiburan & Gaya Hidup',      type: 'expense', icon: 'fa-gamepad',       parent_id: null },   // id 12
];

// Sub-categories are added after parent IDs are known
const DEFAULT_SUBCATEGORIES = [
  // Sub of "Konsumsi & Makanan" (parent name match)
  { name: 'Makan Siang Kantor',   type: 'expense', icon: 'fa-plate-wheat',  parentName: 'Konsumsi & Makanan' },
  { name: 'Kopi & Cemilan',       type: 'expense', icon: 'fa-mug-hot',      parentName: 'Konsumsi & Makanan' },
  { name: 'Belanja Bahan Masak',  type: 'expense', icon: 'fa-basket-shopping', parentName: 'Konsumsi & Makanan' },

  // Sub of "Transportasi Harian"
  { name: 'Bensin / BBM',         type: 'expense', icon: 'fa-gas-pump',     parentName: 'Transportasi Harian' },
  { name: 'Ojol / Taxi Online',   type: 'expense', icon: 'fa-motorcycle',   parentName: 'Transportasi Harian' },
  { name: 'Parkir & Tol',         type: 'expense', icon: 'fa-square-parking', parentName: 'Transportasi Harian' },

  // Sub of "Keperluan Dinas"
  { name: 'Pakaian & Atribut Korpri', type: 'expense', icon: 'fa-vest',     parentName: 'Keperluan Dinas' },
  { name: 'Iuran Organisasi',         type: 'expense', icon: 'fa-users',    parentName: 'Keperluan Dinas' },
  { name: 'Perlengkapan Kerja',       type: 'expense', icon: 'fa-pen-ruler', parentName: 'Keperluan Dinas' },

  // Sub of "Iuran & Potongan"
  { name: 'BPJS Kesehatan',       type: 'expense', icon: 'fa-heart-pulse', parentName: 'Iuran & Potongan' },
  { name: 'Taspen / Pensiun',     type: 'expense', icon: 'fa-landmark',    parentName: 'Iuran & Potongan' },
  { name: 'Potongan Koperasi',    type: 'expense', icon: 'fa-building-columns', parentName: 'Iuran & Potongan' },

  // Sub of "Kebutuhan Rumah Tangga"
  { name: 'Listrik & Air',        type: 'expense', icon: 'fa-bolt',        parentName: 'Kebutuhan Rumah Tangga' },
  { name: 'Internet & Pulsa',     type: 'expense', icon: 'fa-wifi',        parentName: 'Kebutuhan Rumah Tangga' },
  { name: 'Pendidikan Anak',      type: 'expense', icon: 'fa-graduation-cap', parentName: 'Kebutuhan Rumah Tangga' },

  // Sub of "Hiburan & Gaya Hidup"
  { name: 'Streaming & Langganan', type: 'expense', icon: 'fa-tv',         parentName: 'Hiburan & Gaya Hidup' },
  { name: 'Jalan-Jalan / Wisata',  type: 'expense', icon: 'fa-plane-departure', parentName: 'Hiburan & Gaya Hidup' },

  // Sub of "Gaji Pokok" (income)
  { name: 'Gaji Bersih',          type: 'income',  icon: 'fa-money-check',  parentName: 'Gaji Pokok' },
  { name: 'Rapel / Kekurangan',   type: 'income',  icon: 'fa-money-bill-transfer', parentName: 'Gaji Pokok' },

  // Sub of "Tukin / TPP"
  { name: 'TPP Berdasarkan Beban', type: 'income', icon: 'fa-scale-balanced', parentName: 'Tukin / TPP' },
  { name: 'TPP Berdasarkan Kinerja', type: 'income', icon: 'fa-chart-line', parentName: 'Tukin / TPP' },
];

/**
 * Seed default ASN categories + sub-categories if the categories table is empty.
 */
export async function seedCategories() {
  const count = await db.categories.count();
  if (count === 0) {
    // 1. Insert parent categories
    const parentIds = await db.categories.bulkAdd(DEFAULT_CATEGORIES, { allKeys: true });

    // 2. Build name -> id map
    const nameToId = {};
    DEFAULT_CATEGORIES.forEach((cat, i) => {
      nameToId[cat.name] = parentIds[i];
    });

    // 3. Insert sub-categories with resolved parent_id
    const subsWithParentId = DEFAULT_SUBCATEGORIES.map(sub => ({
      name: sub.name,
      type: sub.type,
      icon: sub.icon,
      parent_id: nameToId[sub.parentName] || null,
    }));
    await db.categories.bulkAdd(subsWithParentId);

    const total = DEFAULT_CATEGORIES.length + DEFAULT_SUBCATEGORIES.length;
    console.log(`[FinPraja DB] Seeded ${total} categories (${DEFAULT_CATEGORIES.length} parents + ${DEFAULT_SUBCATEGORIES.length} subs).`);
    return true;
  }
  console.log(`[FinPraja DB] Categories already exist (${count}). Skipping seed.`);
  return false;
}

/**
 * Test database connection by attempting a read.
 */
export async function testConnection() {
  try {
    await db.categories.count();
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/**
 * Initialize the database: open connection + seed defaults.
 */
export async function initDatabase() {
  await db.open();
  await seedCategories();
  const status = await testConnection();
  return status;
}

// ── Helper queries ──

/** Get all parent categories (no parent_id) */
export function getParentCategories(type = null) {
  let query = db.categories.where('parent_id').equals(0); // won't match
  // Dexie doesn't index null well, so we filter
  return db.categories.filter(c => c.parent_id === null && (type ? c.type === type : true)).toArray();
}

/** Get sub-categories for a given parent_id */
export function getSubCategories(parentId) {
  return db.categories.where('parent_id').equals(parentId).toArray();
}

/** Get or create budget for a category + period */
export async function upsertBudget(categoryId, period, amount) {
  const existing = await db.budgets
    .where('[category_id+period]')
    .equals([categoryId, period])
    .first();

  if (existing) {
    await db.budgets.update(existing.id, { amount });
    return existing.id;
  } else {
    return await db.budgets.add({
      category_id: categoryId,
      period,
      amount,
    });
  }
}

/** Get all budgets for a specific period */
export function getBudgetsByPeriod(period) {
  return db.budgets.where('period').equals(period).toArray();
}

/** Get current period string (YYYY-MM) */
export function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
