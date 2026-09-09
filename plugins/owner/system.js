import { reloadPlugins } from '../../src/core/loader.js';
import { saveDb, loadDb } from '../../src/core/db.js';

export const meta = {
    cmd:     ['reload', 'maintenance', 'ban', 'unban'],
    tag:     'owner',
    aliasOnly: true,
    desc:    'Perintah sistem untuk owner',
    isOwner: true,
};

export async function run(sock, { body, raw, from, command, mentionedJid, gdb }) {
    if (command === 'reload') {
        const result = await reloadPlugins();
        return sock.sendMessage(from, {
            text: `♻️ Reload selesai!\n✅ ${result.ok} plugins | ❌ ${result.fail} failed`
        }, { quoted: raw });
    }

    if (command === 'maintenance') {
        gdb.settings.maintenance = !gdb.settings.maintenance;
        await saveDb();
        const status = gdb.settings.maintenance ? '🔧 ON' : '✅ OFF';
        return sock.sendMessage(from, { text: `Maintenance mode: *${status}*` }, { quoted: raw });
    }

    if (command === 'ban' || command === 'unban') {
        const rawTarget = mentionedJid?.[0];
        const targetJid = rawTarget
            ? rawTarget.split(':')[0].replace(/@.+/, '') + (rawTarget.includes('@lid') ? '@lid' : '@s.whatsapp.net')
            : null;
        if (!targetJid) return sock.sendMessage(from, { text: '❌ Tag user yang ingin di-ban.' }, { quoted: raw });
        const db = await loadDb();

        const num = targetJid.split('@')[0];
        const altForm = targetJid.includes('@lid') ? `${num}@s.whatsapp.net` : `${num}@lid`;
        const foundId = db.users[targetJid] ? targetJid : (db.users[altForm] ? altForm : null);

        if (!foundId) return sock.sendMessage(from, { text: '❌ User tidak ditemukan.' }, { quoted: raw });
        db.users[foundId].banned = command === 'ban';
        await saveDb();
        await sock.sendMessage(from, {
            text: `${command === 'ban' ? '🚫 Di-ban' : '✅ Un-ban'}: @${num}`,
            mentions: [targetJid],
        }, { quoted: raw });
    }
}
