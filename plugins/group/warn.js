import { plugin } from '../../src/core/plugin.js';
import { resolveTarget } from '../../src/core/identity.js';
import { kick } from '../../src/wa/group.js';
import { msg } from '../../src/wa/messages.js';
export default plugin('warn', 'unwarn', 'warnlist')
    .in('group')
    .desc('Group member warn/strike system (auto-kick at 3rd warn)')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .signal('User asks to warn, give a warning, or check group warn list', ['warn @user', 'unwarn @user', 'warnlist'])
    .run(async (sock, ctx) => {
        const { from, command, gdb, isBotAdmin, saveDb, reply } = ctx;
        const grp = gdb.groups[from];
        if (!grp.warns) grp.warns = {};

        if (command === 'warnlist') {
            const entries = Object.entries(grp.warns).filter(([, c]) => c > 0);
            if (!entries.length) return reply(msg('done.no_warns'));
            const text = entries.map(([jid, c]) => `• @${jid.split('@')[0]} — ${c}/${MAX_WARN}`).join('\n');
            return reply(msg('warn.list', { text }), { mentions: entries.map(([j]) => j) });
        }

        const found = resolveTarget(ctx);
        if (!found) return reply(msg('need.tag_warn'));
        const { id: target, tag } = found;

        if (command === 'unwarn') {
            grp.warns[target] = Math.max(0, (grp.warns[target] || 0) - 1);
            await saveDb();
            return reply(msg('warn.reduced', { tag, n: grp.warns[target], max: MAX_WARN }), { mentions: [target] });
        }

        grp.warns[target] = (grp.warns[target] || 0) + 1;
        await saveDb();

        if (grp.warns[target] >= MAX_WARN) {
            grp.warns[target] = 0;
            await saveDb();
            if (!isBotAdmin) {
                return reply(msg('warn.kick_fail', { tag, max: MAX_WARN }), { mentions: [target] });
            }
            await reply(msg('done.warn_kick', { tag, max: MAX_WARN }), { mentions: [target] });
            return kick(sock, from, target);
        }

        await reply(msg('warn.hit', { tag, n: grp.warns[target], max: MAX_WARN }), { mentions: [target] });
    });

const MAX_WARN = 3;
