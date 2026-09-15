<p align="center">
  <img src="https://raw.githubusercontent.com/onepunya/siswanda-fox_onepunya-/refs/heads/main/watermark-removed-44752.png" alt="Levatain-MD Banner" width="100%">
</p>

# Levatain-MD

Bot WhatsApp AI-first berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) (Node.js, ESM). Selain command dengan prefix biasa, bot ini punya **intent engine** — AI yang membaca chat natural (tanpa prefix) dan otomatis merutekannya ke plugin yang sesuai.

## Struktur Folder

```
.
├── index.js              Entry point — koneksi WhatsApp, pairing, event handler utama
├── package.json          Daftar dependency & script npm
├── .env.example          Template environment variable (copy jadi .env)
├── src/
│   ├── config.js         Semua environment variable dibaca dari sini (satu sumber kebenaran)
│   ├── handler.js        Router pesan masuk → deteksi prefix/command → plugin, atau lempar ke AI
│   ├── ai/               Intent engine (engine.js), gate trigger word grup (gate.js), memori percakapan
│   ├── core/             Loader plugin auto-scan (loader.js) & database lokal (db.js)
│   └── lib/              Helper: API eksternal, audio effects, session interaktif, dashboard web, dll
└── plugins/              Semua command bot, dikelompokkan per kategori, auto ke-load oleh loader
    ├── main/             menu, ping, sc (script/source)
    ├── ai/                chat, imagine (text-to-image), editimage, musicgen, memory
    ├── audiochanger/     Efek audio: bassboost, nightcore, reverb, reverse, 8d, dll (pakai ffmpeg)
    ├── download/         Downloader: TikTok, YouTube, Instagram, Facebook, Twitter/X, Pinterest, dll
    ├── fun/               Fitur hiburan/game grup: tod, impostor, tembak, pilihacak
    ├── group/            Fitur grup: tagall, warn (sistem strike), add, groupset, afk, dll
    ├── owner/            Command khusus owner (mode, system, dashboard, eval)
    └── tools/            Utility: sticker, upscale, removebg, toimg, tourl, gempa
```

## Cara Kerja Command

Bot mendukung dua cara pemanggilan command sekaligus:

1. **Prefix biasa** — ketik simbol apa saja (`.`, `!`, `#`, dll) diikuti nama command, misal `.tiktok <url>`.
2. **Bahasa natural (AI intent engine)** — ketik kalimat biasa tanpa prefix, misal *"download tiktok ini dong"* atau *"buatin stiker dari foto ini"*. AI (`src/ai/engine.js`) membaca daftar plugin beserta metadata `ai.trigger`/`ai.examples`-nya, lalu memutuskan command mana yang paling cocok dan menjalankannya otomatis.

**Khusus di dalam grup**, AI (chat maupun intent engine) hanya aktif kalau salah satu dari ini terpenuhi (`src/ai/gate.js`):
- Pesan mengandung kata pemicu `lev` / `levatain` / `leva`
- Bot di-mention
- Pesan me-reply/quote pesan bot

Ini supaya bot tidak ikut nyaut ke semua obrolan di grup.

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
- Minimal salah satu AI key: `GEMINI_KEY_1` (gratis di [Google AI Studio](https://aistudio.google.com/apikey)) atau `NAGA_API_KEY`

Variabel lain (Giphy, OnePunya, Magic Hour, AudD/Shazam, translate, dashboard port, dll) bersifat opsional — lihat komentar di `.env.example` untuk penjelasan tiap variabel.

## Cara Ambil Semua API Key

Semua key di bawah ini ditaruh di file `.env` (bukan `.env.example`), satu baris per variabel, format `NAMA_VARIABEL=nilai-key-nya` tanpa spasi/tanda kutip.

| Key dipakai untuk | Env var | Cara ambil |
|---|---|---|
| AI chat & intent engine (utama) pake cookie GEMINI cari pake devtools |
| AI chat (fallback) | `NAGA_API_KEY` | Join Discord server [NagaAI](https://naga.ac/) → di channel bot, ketik command `/account key get` → key langsung dikirim bot. Opsional, cuma dipakai kalau semua Gemini key gagal/limit. |
| Fitur download/tools tertentu | `ONEPUNYA_API_KEY` | OnePunya bukan layanan publik dengan pendaftaran mandiri — ini API pribadi/komunitas milik developer independen. Hubungi langsung pemiliknya lewat [GitHub](https://github.com/onepunya) atau kontak yang tertera di sana untuk minta akses key. |
| Stiker mood/AI (Giphy) | `GIPHY_API_KEY` | Buka [developers.giphy.com](https://developers.giphy.com/) → **Create an App** → pilih **API** (bukan SDK) → copy API Key yang muncul. |
| `.editimage` / `.aiedit` (Magic Hour) | `MAGICHOUR_KEY_1` s/d `MAGICHOUR_KEY_3` | Daftar di [magichour.ai](https://magichour.ai/) → masuk **Dashboard** → menu **API Keys** → generate key baru. Bisa isi lebih dari satu untuk auto-rotate. |
| `.play` kenali lagu (fallback) | `AUDD_API_KEY` | Daftar gratis di [dashboard.audd.io](https://dashboard.audd.io/). |
| `.play` kenali lagu (dicoba pertama) | `SHAZAM_RAPIDAPI_KEY`, `SHAZAM_RAPIDAPI_HOST` | Daftar & subscribe (ada free plan) di [RapidAPI - Shazam API](https://rapidapi.com/diyorbekkanal/api/shazam-api6). |

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

Ada juga `npm run dev` yang menjalankan bot dengan `node --watch` (auto-restart tiap ada perubahan file, enak buat development).

Proses `npm start` berjalan di foreground dan akan mati kalau terminal/SSH ditutup. Untuk menjaganya tetap hidup, pakai salah satu cara berikut:

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
   - Kalau egg Pterodactyl-nya menyediakan slot "Environment Variables" di tab Startup, isi variabel yang sama di sana (nama variabel harus sama persis: `PAIRING_NUMBER`, `OWNER_NUMBER`, `GEMINI_KEY_1`, dst).
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

Semua plugin pakai format registry `onepunya.interface()` — bukan `export function run()` biasa. Contoh minimal:

```js
export const meta = {
    interface: {
        cmd:  ['namacommand', 'alias1'],   // command utama + alias, semua lowercase
        tag:  'kategori',                  // dipakai buat pengelompokan di menu
        aliasOnly: true,                   // true = hanya bisa dipanggil pakai prefix
        desc: 'Deskripsi singkat buat menu',
        ai: {
            trigger: 'Kapan AI harus memicu command ini (dalam bahasa natural)',
            examples: ['contoh kalimat 1', 'contoh kalimat 2'],
            args: { url: 'Penjelasan argumen kalau ada' }, // opsional
        },
        async run(sock, { raw, from, body, args, command, isOwner, pushname }) {
            // logic command di sini
            await sock.sendMessage(from, { text: 'Halo!' }, { quoted: raw });
        },
    },
};
```

Taruh file baru di folder `plugins/<kategori>/`. Plugin otomatis ke-scan dan didaftarkan oleh `src/core/loader.js` berdasarkan `meta.interface.cmd` — **tidak perlu didaftarin manual di tempat lain**. Blok `ai` opsional tapi disarankan diisi supaya command juga bisa dipicu lewat chat natural, tidak cuma lewat prefix.

Owner bisa reload semua plugin tanpa restart proses pakai command `.reload`.

> Kalau porting plugin dari bot referensi (CommonJS / format `module.exports`), harus diadaptasi ke format `onepunya.interface()` di atas, bukan copy-paste langsung.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Bot exit langsung saat start | Cek `PAIRING_NUMBER` sudah diisi di `.env` |
| Fitur AI chat / intent engine gak jalan | Cek minimal satu `GEMINI_KEY_*` atau `NAGA_API_KEY` sudah diisi |
| AI tidak merespon di grup | Sebut nama bot / kata `lev`, mention bot, atau reply pesan bot — di grup AI tidak auto-nyaut semua chat |
| Fitur audio/effect error | Pastikan `ffmpeg` ter-install di sistem, cek `ffmpeg -version` |
| Session logout terus | Hapus folder `session/`, restart bot, pairing ulang |
| `isOwner` selalu false | Ikuti langkah di atas untuk isi `OWNER_LID` manual |
| Bot mati saat SSH ditutup (VPS) | Pakai `pm2` atau `screen`, lihat bagian "Menjalankan di VPS Biasa" |
| Plugin baru tidak muncul | Pastikan format `meta.interface.cmd` & `meta.interface.run` benar, lalu jalankan `.reload` atau restart bot |
