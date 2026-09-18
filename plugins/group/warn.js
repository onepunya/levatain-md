import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';
export default plugin('warn', 'unwarn', 'warnlist')
    .in('group')
    .desc('Group member warn/strike system (auto-kick at 3rd warn)')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .signal('User asks to warn, give a warning, or check group warn list', ['warn @user', 'unwarn @user', 'warnlist'])
    .run(async (sock, { raw, from, command, mentionedJid, message, gdb, isBotAdmin, saveDb, primaryId }) => {
        const grp = gdb.groups[from];
        if (!grp.warns) grp.warns = {};

        if (command === 'warnlist') {
            const entries = Object.entries(grp.warns).filter(([, c]) => c > 0);
            if (!entries.length) return sock.sendMessage(from, { text: msg('done.no_warns') }, { quoted: raw });
            const text = entries.map(([jid, c]) => `• @${jid.split('@')[0]} — ${c}/${MAX_WARN}`).join('\n');
            return sock.sendMessage(from, { text: msg('warn.list', { text }), mentions: entries.map(([j]) => j) }, { quoted: raw });
        }

        let target;
        if (message.quoted) {
            const s = message.quoted.sender.replace(/@.*/, '').split(':')[0];
            target  = message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
        } else if (mentionedJid?.[0]) {
            target = mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
        }
        if (!target) return sock.sendMessage(from, { text: msg('need.tag_warn') }, { quoted: raw });

        const tag = `@${target.split('@')[0]}`;

        if (command === 'unwarn') {
            grp.warns[target] = Math.max(0, (grp.warns[target] || 0) - 1);
            await saveDb();
            return sock.sendMessage(from, { text: msg('warn.reduced', { tag, n: grp.warns[target], max: MAX_WARN }), mentions: [target] }, { quoted: raw });
        }

        grp.warns[target] = (grp.warns[target] || 0) + 1;
        await saveDb();

        if (grp.warns[target] >= MAX_WARN) {
            grp.warns[target] = 0;
            await saveDb();
            if (!isBotAdmin) {
                return sock.sendMessage(from, { text: msg('warn.kick_fail', { tag, max: MAX_WARN }), mentions: [target] }, { quoted: raw });
            }
            await sock.sendMessage(from, { text: msg('done.warn_kick', { tag, max: MAX_WARN }), mentions: [target] }, { quoted: raw });
            return sock.groupParticipantsUpdate(from, [target], 'remove');
        }

        await sock.sendMessage(from, { text: msg('warn.hit', { tag, n: grp.warns[target], max: MAX_WARN }), mentions: [target] }, { quoted: raw });
    });

const MAX_WARN = 3;

