import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    formatAether,
    createGuild,
    joinGuild,
    leaveGuild,
    getGuild,
    buildGuildText,
    buildGuildListText,
    GUILD_CREATE_COST,
} from '../../src/rpg/index.js';

export default plugin('guild', 'serikat')
    .in('rpg')
    .desc('Guild system — create, join, leave, info')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants guild create join leave info', [
        '.guild',
        '.guild create Dragon',
        '.guild join Dragon',
        '.guild leave',
    ])
    .run(async (sock, { primaryId, gdb, body, reply }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return reply(t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'));
        }

        const char = getCharacter(user);
        if (!char) {
            return reply(t('no_character', 'id'));
        }

        const lang = char.lang || 'id';
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const action = (parts[0] || '').toLowerCase();
        const nameArg = parts.slice(1).join(' ').trim();

        if (!action || action === 'info') {
            const guild = getGuild(gdb, char);
            return reply(buildGuildText(gdb, guild, lang));
        }

        if (action === 'list' || action === 'daftar') {
            return reply(buildGuildListText(gdb, lang));
        }

        if (action === 'create' || action === 'buat') {
            if (!nameArg) {
                return reply(t('guild_need_name', lang));
            }

            const result = createGuild(gdb, primaryId, char, nameArg);
            if (!result.ok) {
                const map = {
                    IN_GUILD: t('guild_in', lang),
                    BAD_NAME: t('guild_bad_name', lang),
                    NAME_TAKEN: t('guild_taken', lang),
                    NO_MONEY: t('no_money', lang, formatAether(result.need || GUILD_CREATE_COST), formatAether(char.aether)),
                };
                return reply(map[result.reason] || `❌ ${result.reason}`);
            }

            await persist();
            return reply(t('guild_created', lang, result.guild.name, formatAether(GUILD_CREATE_COST)));
        }

        if (action === 'join' || action === 'gabung') {
            if (!nameArg) {
                return reply(t('guild_need_name', lang));
            }

            const result = joinGuild(gdb, primaryId, char, nameArg);
            if (!result.ok) {
                const map = {
                    IN_GUILD: t('guild_in', lang),
                    NOT_FOUND: t('guild_not_found', lang),
                    FULL: t('guild_full', lang),
                };
                return reply(map[result.reason] || `❌ ${result.reason}`);
            }

            await persist();
            return reply(t('guild_joined', lang, result.guild.name));
        }

        if (action === 'leave' || action === 'keluar') {
            const result = leaveGuild(gdb, primaryId, char);
            if (!result.ok) {
                return reply(t('guild_no', lang));
            }
            await persist();
            return reply(t('guild_left', lang));
        }

        return reply(t('guild_need_name', lang));
    });
