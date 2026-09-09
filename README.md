# Levatain-MD

Bot WhatsApp AI-first berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) (Node.js, ESM).

## Struktur Folder

```
.
├── index.js              Entry point — koneksi WhatsApp, pairing, event handler utama
├── package.json          Daftar dependency & script npm
├── .env.example          Template environment variable (copy jadi .env)
├── src/
│   ├── config.js         Semua environment variable dibaca dari sini (satu sumber kebenaran)
│   ├── handler.js        Router pesan masuk → plugin
│   ├── ai/               Logic AI chat (engine, gate, memory percakapan)
│   ├── core/             Loader plugin (loader.js) & database lokal (db.js)
│   └── lib/              Helper: API eksternal, audio effects, session, dashboard, dll
└── plugins/              Semua command bot, dikelompokkan per kategori
    ├── ai/               chat, imagine (text-to-image), editimage, musicgen
    ├── audiochanger/     Efek audio: bassboost, nightcore, reverse, dll
    ├── download/         Downloader: TikTok, YouTube, Instagram, Facebook, dll
    ├── fun/               Fitur hiburan/game grup
    ├── group/            Fitur grup: tagall, warn, add, groupset, dll
    ├── owner/            Command khusus owner (mode, system, dashboard)
    └── tools/            Utility: menu, sticker, upscale, removebg, dll
```

## Persyaratan

- **Node.js** versi 20 ke atas
- **ffmpeg** harus ter-install di sistem (bukan cuma npm package) — dipakai untuk fitur audio changer dan konversi media
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Cek sudah ada: `ffmpeg -version`

## Konfigurasi Environment Variable

Semua konfigurasi lewat file `.env` (tidak pernah di-commit ke repo, sudah masuk `.gitignore`).

```bash
cp .env.example .env
```

Buka `.env` dan isi minimal:
- `PAIRING_NUMBER` — nomor WA yang mau dijadiin bot (format `628xxxxxxxxxx`, tanpa `+`)
- `OWNER_NUMBER` — nomor WA kamu sebagai owner
- Minimal salah satu AI key: `GROQ_KEY_1` (gratis di [console.groq.com](https://console.groq.com/keys)) atau `NAGA_API_KEY`

Variabel lain (Giphy, OnePunya, Magic Hour, translate, dashboard port, dll) bersifat opsional — lihat komentar di `.env.example` untuk penjelasan tiap variabel.

## Cara Ambil Semua API Key

Semua key di bawah ini ditaruh di file `.env` (bukan `.env.example`), satu baris per variabel, format `NAMA_VARIABEL=nilai-key-nya` tanpa spasi/tanda kutip.

| Key dipakai untuk | Env var | Cara ambil |
|---|---|---|
| AI chat (utama) | `GROQ_KEY_1` s/d `GROQ_KEY_5` | Daftar gratis di [console.groq.com](https://console.groq.com/), buka menu **API Keys** → **Create API Key**. Bisa isi lebih dari satu key (bot auto-rotate kalau salah satu kena rate limit) — minimal isi `GROQ_KEY_1`. |
| AI chat (fallback) | `NAGA_API_KEY` | Join Discord server [NagaAI](https://naga.ac/) → di channel bot, ketik command `/account key get` → key langsung dikirim bot. Opsional, cuma dipakai kalau semua Groq key habis kuota. |
| Fitur download/tools tertentu | `ONEPUNYA_API_KEY` | OnePunya bukan layanan publik dengan pendaftaran mandiri — ini API pribadi/komunitas milik developer independen. Hubungi langsung pemiliknya lewat [GitHub](https://github.com/onepunya) atau kontak yang tertera di sana untuk minta akses key. |
| Stiker mood/AI (Giphy) | `GIPHY_API_KEY` | Buka [developers.giphy.com](https://developers.giphy.com/) → **Create an App** → pilih **API** (bukan SDK) → copy API Key yang muncul. |
| `.editimage` / `.aiedit` (Magic Hour) | `MAGICHOUR_KEY_1` s/d `MAGICHOUR_KEY_3` | Daftar di [magichour.ai](https://magichour.ai/) → masuk **Dashboard** → menu **API Keys** → generate key baru. Bisa isi lebih dari satu untuk auto-rotate. |

Setelah key didapat, buka `.env`, tempel di baris env var yang sesuai, simpan, lalu restart bot (`npm start` ulang / `pm2 restart levatain-md`).

> Semua key di atas gratis untuk mulai (ada limit/kuota gratis masing-masing provider). Jangan pernah commit file `.env` yang sudah terisi ke repo publik.

---

## Menjalankan di VPS Biasa

### 1. Install dependency
```bash
npm install
```

### 2. Jalankan bot
```bash
npm start
```

Proses ini berjalan di foreground dan akan mati kalau terminal/SSH ditutup. Untuk menjaganya tetap hidup, pakai salah satu cara berikut:

**Opsi A — pakai `pm2` (disarankan)**
```bash
npm install -g pm2
pm2 start index.js --name levatain-md
pm2 save
pm2 startup   # ikuti instruksi yang muncul supaya bot auto-start saat VPS reboot
```
Cek log: `pm2 logs levatain-md` · Restart: `pm2 restart levatain-md` · Stop: `pm2 stop levatain-md`

**Opsi B — pakai `screen`**
```bash
screen -S levatain-md
npm start
# tekan Ctrl+A lalu D untuk detach (bot tetap jalan di background)
```
Balik ke sesi: `screen -r levatain-md`

Saat pertama kali jalan, bot akan menampilkan **kode pairing** di terminal. Buka WhatsApp di HP → **⋮ (titik tiga) → Perangkat Tertaut → Tautkan dengan nomor telepon** → masukkan kode tersebut.

---

## Menjalankan di Pterodactyl Panel

1. **Buat server baru** dengan egg **Node.js** (Nodejs Generic/YSN Node.js egg atau sejenisnya, minimal versi Node 20).
2. **Upload source code** bot ke direktori server (lewat file manager panel, SFTP, atau `git clone` dari repo ini kalau egg-nya mendukung).
3. **Isi environment variable** — dua cara, pilih salah satu:
   - Buat file `.env` langsung di root project (upload manual isinya, boleh isi ulang dari `.env.example`), **atau**
   - Kalau egg Pterodactyl-nya menyediakan slot "Environment Variables" di tab Startup, isi variabel yang sama di sana (nama variabel harus sama persis: `PAIRING_NUMBER`, `OWNER_NUMBER`, `GROQ_KEY_1`, dst).
4. **Startup command** — set ke:
   ```
   npm install && npm start
   ```
   atau kalau egg sudah otomatis jalanin `npm install`, cukup:
   ```
   node index.js
   ```
5. **Dashboard web bot** — kalau mau diakses dari luar, samakan `DASHBOARD_PORT` di `.env` dengan port allocation yang dikasih Pterodactyl untuk server tersebut.
6. **Start server** dari panel, buka tab Console untuk lihat kode pairing, lalu tautkan seperti biasa dari WhatsApp.

> Catatan: Pterodactyl biasanya me-restart proses otomatis kalau crash — jadi tidak perlu `pm2`/`screen` tambahan di dalam container.

---

## Kalau `isOwner` Gagal Terdeteksi

Kadang deteksi owner otomatis gagal (kasus LID WhatsApp). Kalau ini terjadi:
1. Set `DEBUG=true` di `.env`, restart bot.
2. Kirim pesan apa saja ke bot dari nomor owner.
3. Buka `logs/bot.log`, cari baris `[owner-check]`.
4. Copy angka dari `lid=XXXXXXXXXX@lid` (angka saja, tanpa `@lid`).
5. Isi ke `OWNER_LID` di `.env`, restart bot.

## Menambah Plugin/Command Baru

Semua plugin pakai format ESM dengan konvensi:
```js
export const meta = {
    name: 'namacommand',
};

export async function run(sock, ctx) {

}
```
Taruh file baru di folder `plugins/<kategori>/`, plugin akan otomatis ke-load oleh `src/core/loader.js` — gak perlu didaftarin manual.

> Kalau porting plugin dari bot referensi (CommonJS), harus diadaptasi ke format ESM di atas, bukan copy-paste langsung.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Bot exit langsung saat start | Cek `PAIRING_NUMBER` sudah diisi di `.env` |
| Fitur AI chat gak jalan | Cek minimal satu `GROQ_KEY_*` atau `NAGA_API_KEY` sudah diisi |
| Fitur audio/effect error | Pastikan `ffmpeg` ter-install di sistem, cek `ffmpeg -version` |
| Session logout terus | Hapus folder `session/`, restart bot, pairing ulang |
| `isOwner` selalu false | Ikuti langkah di atas untuk isi `OWNER_LID` manual |
| Bot mati saat SSH ditutup (VPS) | Pakai `pm2` atau `screen`, lihat bagian "Menjalankan di VPS Biasa" |
