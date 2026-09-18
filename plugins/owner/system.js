import { reloadPlugins } from '../../src/core/loader.js';
import { saveDb, loadDb } from '../../src/core/db.js';
import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';

export default plugin('reload', 'maintenance', 'ban', 'unban')
    .in('owner')
    .desc('System commands for owner')
    .showAllAliases()
    .ownerOnly()
    .run(async (sock, { body, raw, from, command, mentionedJid, gdb, primaryId }) => {
        if (command === 'reload') {
            const result = await reloadPlugins();
            return sock.sendMessage(from, {
                text: msg('done.reload', { ok: result.ok, fail: result.fail })
            }, { quoted: raw });
        }

        if (command === 'maintenance') {
            gdb.settings.maintenance = !gdb.settings.maintenance;
            await saveDb();
            const status = gdb.settings.maintenance ? '🔧 ON' : '✅ OFF';
            return sock.sendMessage(from, { text: msg('done.maintenance', { status }) }, { quoted: raw });
        }

        if (command === 'ban' || command === 'unban') {
            const rawTarget = mentionedJid?.[0];
            const targetJid = rawTarget
                ? rawTarget.split(':')[0].replace(/@.+/, '') + (rawTarget.includes('@lid') ? '@lid' : '@s.whatsapp.net')
                : null;
            if (!targetJid) return sock.sendMessage(from, { text: msg('need.tag_ban') }, { quoted: raw });
            const db = await loadDb();

            const num = targetJid.split('@')[0];
            const altForm = targetJid.includes('@lid') ? `${num}@s.whatsapp.net` : `${num}@lid`;
            const foundId = db.users[targetJid] ? targetJid : (db.users[altForm] ? altForm : null);

            if (!foundId) return sock.sendMessage(from, { text: msg('fail.user_not_found') }, { quoted: raw });
            db.users[foundId].banned = command === 'ban';
            await saveDb();
            await sock.sendMessage(from, {
                text: command === 'ban' ? msg('done.ban', { num }) : msg('done.unban', { num }),
                mentions: [targetJid],
            }, { quoted: raw });
        }
    });

