import { plugin } from '../../src/core/plugin.js';
import { resolveTarget } from '../../src/core/identity.js';
import { MEMBER_ACTIONS } from '../../src/wa/group.js';
import { msg } from '../../src/wa/messages.js';

export default plugin('kick', 'promote', 'demote')
    .in('group')
    .desc('Group member management (kick/promote/demote)')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .botAdmin()
    .signal('User asks to kick, promote, or demote a group member', ['kick @user', 'promote @admin', 'remove this user'])
    .run(async (sock, ctx) => {
        const action = MEMBER_ACTIONS[ctx.command];
        if (!action) return;

        const target = resolveTarget(ctx);
        if (!target) return ctx.reply(msg('need.tag'));
        if (!target.participant) return ctx.reply(msg('fail.user_not_in_group'));

        const { id } = target.participant;
        await action.run(sock, ctx.from, id);
        await ctx.reply(`✅ @${id.split('@')[0]} ${action.done}`, { mentions: [id] });
    });
