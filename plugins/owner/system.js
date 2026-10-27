import { reloadPlugins } from '../../src/core/loader.js';
import { saveDb, loadDb } from '../../src/storage/db.js';
import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/wa/messages.js';

export default plugin('reload', 'maintenance', 'ban', 'unban')
    .in('owner')
    .desc('System commands for owner')
    .showAllAliases()
    .ownerOnly()
    .run(async (sock, {
        command,
        mentionedJid,
        gdb,
        reply
    }) => {
        if (command === 'reload') {
            const result = await reloadPlugins();
            return reply(msg('done.reload', { ok: result.ok, fail: result.fail }));
        }

        if (command === 'maintenance') {
            gdb.settings.maintenance = !gdb.settings.maintenance;
            await saveDb();
            const status = gdb.settings.maintenance ? '🔧 ON' : '✅ OFF';
            return reply(msg('done.maintenance', { status }));
        }

        if (command === 'ban' || command === 'unban') {
            const rawTarget = mentionedJid?.[0];
            const targetJid = rawTarget
                ? rawTarget.split(':')[0].replace(/@.+/, '') + (rawTarget.includes('@lid') ? '@lid' : '@s.whatsapp.net')
                : null;
            if (!targetJid) return reply(msg('need.tag_ban'));
            const db = await loadDb();

            const num = targetJid.split('@')[0];
            const altForm = targetJid.includes('@lid') ? `${num}@s.whatsapp.net` : `${num}@lid`;
            const foundId = db.users[targetJid] ? targetJid : (db.users[altForm] ? altForm : null);

            if (!foundId) return reply(msg('fail.user_not_found'));
            db.users[foundId].banned = command === 'ban';
            await saveDb();
            await reply({
                text: command === 'ban' ? msg('done.ban', { num }) : msg('done.unban', { num }),
                mentions: [targetJid],
            });
        }
    });
