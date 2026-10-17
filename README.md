# FinPraja

Aplikasi manajemen keuangan pribadi khusus **ASN (Aparatur Sipil Negara)**.

FinPraja adalah Progressive Web App (PWA) offline-first yang berjalan di browser. Semua data disimpan secara lokal di perangkat menggunakan IndexedDB (Dexie.js), sehingga tetap bisa digunakan tanpa internet.

## Fitur

- **Dashboard** — Saldo bulan ini, total pemasukan & pengeluaran, sisa anggaran, transaksi terakhir
- **Pencatatan Transaksi** — Pemasukan dan pengeluaran dengan kategori hierarki (parent + sub-kategori)
- **Edit Transaksi** — Ubah transaksi yang sudah tercatat
- **Kategori Khusus ASN** — Gaji Pokok, Tukin/TPP, Uang Makan, BPJS, Taspen, Keperluan Dinas, dll.
- **Anggaran Bulanan** — Atur batas pengeluaran per kategori
- **Laporan Visual** — Donut chart (distribusi), Bar chart (anggaran vs realisasi), Line chart (tren harian)
- **Scan Struk (OCR)** — Ekstraksi nominal otomatis dari foto struk menggunakan Tesseract.js
- **Import CSV** — Impor transaksi dari file CSV dengan deteksi duplikat
- **Export CSV** — Unduh semua transaksi dalam format CSV (Tanggal, Keterangan, Jumlah, Tipe, Kategori)
- **Backup & Restore** — Ekspor/impor data lengkap dalam format JSON
- **Pencarian Transaksi** — Cari berdasarkan catatan atau nama kategori
- **Service Worker** — App shell tetap bisa dibuka saat offline

## Tech Stack

- Vue 3 + Vite
- Vue Router
- Tailwind CSS + DaisyUI
- Dexie.js (IndexedDB)
- Chart.js
- Tesseract.js (OCR)
- Font Awesome

## Cara Menjalankan

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build untuk production
npm run build

# Preview build
npm run preview
```

## Deploy

Aplikasi di-deploy di Vercel: [https://finpraja.vercel.app](https://finpraja.vercel.app)

## Lisensi

MIT
