import { loadDb, saveDb } from '../../src/core/db.js';

const AUTOGEMPA_URL = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
const WATCH_INTERVAL = 3 * 60 * 1000;

function formatGempa(g, prefix = '📍 *Info Gempa Terkini (BMKG)*') {
    return [
        prefix,
        '',
        `🕒 ${g.Tanggal}, ${g.Jam}`,
        `📌 ${g.Wilayah}`,
        `💥 Magnitudo: ${g.Magnitude}`,
        `📏 Kedalaman: ${g.Kedalaman}`,
        `🌐 Koordinat: ${g.Coordinates}`,
        g.Dirasakan ? `🫨 Dirasakan: ${g.Dirasakan}` : '',
        g.Potensi ? `⚠️ Potensi: ${g.Potensi}` : '',
    ].filter(Boolean).join('\n');
}

async function fetchGempa() {
    const res = await fetch(AUTOGEMPA_URL);
    if (!res.ok) throw new Error(`BMKG HTTP ${res.status}`);
    const data = await res.json();
    const g = data?.Infogempa?.gempa;
    if (!g) throw new Error('Data BMKG kosong/format berubah');
    return g;
}

async function watchGempa() {
    try {
        const g = await fetchGempa();
        const id = g.DateTime || `${g.Tanggal}-${g.Jam}`;
        const db = await loadDb();
        db.settings.gempaSubscribers ??= [];
        const subs = db.settings.gempaSubscribers;

        if (db.settings.lastGempaId === undefined) {
            db.settings.lastGempaId = id;
            await saveDb();
        } else if (db.settings.lastGempaId !== id) {
            db.settings.lastGempaId = id;
            await saveDb();

            if (global.botConnected && global.sock && subs.length) {
                const caption = formatGempa(g, '🚨 *PERINGATAN GEMPA BARU (BMKG)*');
                const shakemapUrl = g.Shakemap ? `https://data.bmkg.go.id/DataMKG/TEWS/${g.Shakemap}` : null;
                for (const jid of subs) {
                    try {
                        if (shakemapUrl) {
                            await global.sock.sendMessage(jid, { image: { url: shakemapUrl }, caption });
                        } else {
                            await global.sock.sendMessage(jid, { text: caption });
                        }
                    } catch {}
                }
            }
        }
    } catch {}

    setTimeout(watchGempa, WATCH_INTERVAL);
}

if (!global.__gempaWatcherStarted) {
    global.__gempaWatcherStarted = true;
    watchGempa();
}

export const meta = {
    interface: {
        cmd:     ['gempa', 'cekgempa', 'gempaon', 'gempaoff'],
        tag:     'tools',
        aliasOnly: false,
        desc:    'Cek info gempa terkini (BMKG) & atur peringatan gempa otomatis di chat ini',
        ai: {
            trigger: 'User nanya/cek info gempa terkini pakai command="gempa". User minta aktifkan notifikasi gempa otomatis di chat ini pakai command="gempaon". User minta matikan notifikasi gempa otomatis pakai command="gempaoff"',
            examples: ['ada gempa gak', 'cek gempa terkini', 'info gempa hari ini', 'aktifin peringatan gempa disini', 'matiin notif gempa', 'langganan info gempa otomatis'],
        },
        async run(sock, { raw, from, command, isGroup, isAdmin, isOwner, gdb }) {
            if (command === 'gempa' || command === 'cekgempa') {
                try {
                    const g = await fetchGempa();
                    const shakemapUrl = g.Shakemap ? `https://data.bmkg.go.id/DataMKG/TEWS/${g.Shakemap}` : null;
                    const caption = formatGempa(g);
                    if (shakemapUrl) {
                        await sock.sendMessage(from, { image: { url: shakemapUrl }, caption }, { quoted: raw });
                    } else {
                        await sock.sendMessage(from, { text: caption }, { quoted: raw });
                    }
                } catch (e) {
                    await sock.sendMessage(from, { text: `❌ Gagal ambil data BMKG: ${e.message}` }, { quoted: raw });
                }
                return;
            }

            if (isGroup && !isAdmin && !isOwner) {
                return sock.sendMessage(from, { text: '👤 Cuma admin grup yang boleh atur ini.' }, { quoted: raw });
            }

            gdb.settings.gempaSubscribers ??= [];
            const subs = gdb.settings.gempaSubscribers;

            if (command === 'gempaon') {
                if (!subs.includes(from)) subs.push(from);
                await saveDb();
                return sock.sendMessage(from, { text: '✅ Peringatan gempa otomatis diaktifkan di chat ini.' }, { quoted: raw });
            }

            const idx = subs.indexOf(from);
            if (idx !== -1) subs.splice(idx, 1);
            await saveDb();
            return sock.sendMessage(from, { text: '❌ Peringatan gempa otomatis dimatikan di chat ini.' }, { quoted: raw });
        },
    },
};
