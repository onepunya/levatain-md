import { loadDb, saveDb } from '../../src/core/db.js';
import { fetchJson, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

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
    const data = await fetchJson(AUTOGEMPA_URL);
    const g = data?.Infogempa?.gempa;
    if (!g) throw new Error('Data BMKG empty/format changed');
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

export default plugin('gempa', 'cekgempa', 'gempaon', 'gempaoff')
    .in('tools')
    .desc('Check latest earthquake info (BMKG) & set auto alerts in this chat')
    .showAllAliases()
    .signal('User asks for latest earthquake info with command="gempa", or to enable notifications', ['any earthquakes?', 'check latest earthquake', 'earthquake info today', 'enable earthquake alerts here', 'disable earthquake notifications', 'subscribe to automatic earthquake info'])
    .run(async (sock, { raw, from, command, isGroup, isAdmin, isOwner, gdb, primaryId }) => {
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
                await sock.sendMessage(from, { text: msg('fail.bmkg', { msg: e.message }) }, { quoted: raw });
            }
            return;
        }

        if (isGroup && !isAdmin && !isOwner) {
            return sock.sendMessage(from, { text: msg('sys.admin_only_short') }, { quoted: raw });
        }

        gdb.settings.gempaSubscribers ??= [];
        const subs = gdb.settings.gempaSubscribers;

        if (command === 'gempaon') {
            if (!subs.includes(from)) subs.push(from);
            await saveDb();
            return sock.sendMessage(from, { text: msg('done.gempa_on') }, { quoted: raw });
        }

        const idx = subs.indexOf(from);
        if (idx !== -1) subs.splice(idx, 1);
        await saveDb();
        return sock.sendMessage(from, { text: msg('done.gempa_off') }, { quoted: raw });
    });

