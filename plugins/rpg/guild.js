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
    .run(async (sock, { raw, from, primaryId, gdb, body }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return sock.sendMessage(from, {
                text: t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'),
            }, { quoted: raw });
        }

        const char = getCharacter(user);
        if (!char) {
            return sock.sendMessage(from, {
                text: t('no_character', 'id'),
            }, { quoted: raw });
        }

        const lang = char.lang || 'id';
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const action = (parts[0] || '').toLowerCase();
        const nameArg = parts.slice(1).join(' ').trim();

        if (!action || action === 'info') {
            const guild = getGuild(gdb, char);
            return sock.sendMessage(from, {
                text: buildGuildText(gdb, guild, lang),
            }, { quoted: raw });
        }

        if (action === 'list' || action === 'daftar') {
            return sock.sendMessage(from, {
                text: buildGuildListText(gdb, lang),
            }, { quoted: raw });
        }

        if (action === 'create' || action === 'buat') {
            if (!nameArg) {
                return sock.sendMessage(from, {
                    text: t('guild_need_name', lang),
                }, { quoted: raw });
            }

            const result = createGuild(gdb, primaryId, char, nameArg);
            if (!result.ok) {
                const map = {
                    IN_GUILD: t('guild_in', lang),
                    BAD_NAME: t('guild_bad_name', lang),
                    NAME_TAKEN: t('guild_taken', lang),
                    NO_MONEY: t('no_money', lang, formatAether(result.need || GUILD_CREATE_COST), formatAether(char.aether)),
                };
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();
            return sock.sendMessage(from, {
                text: t('guild_created', lang, result.guild.name, formatAether(GUILD_CREATE_COST)),
            }, { quoted: raw });
        }

        if (action === 'join' || action === 'gabung') {
            if (!nameArg) {
                return sock.sendMessage(from, {
                    text: t('guild_need_name', lang),
                }, { quoted: raw });
            }

            const result = joinGuild(gdb, primaryId, char, nameArg);
            if (!result.ok) {
                const map = {
                    IN_GUILD: t('guild_in', lang),
                    NOT_FOUND: t('guild_not_found', lang),
                    FULL: t('guild_full', lang),
                };
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();
            return sock.sendMessage(from, {
                text: t('guild_joined', lang, result.guild.name),
            }, { quoted: raw });
        }

        if (action === 'leave' || action === 'keluar') {
            const result = leaveGuild(gdb, primaryId, char);
            if (!result.ok) {
                return sock.sendMessage(from, {
                    text: t('guild_no', lang),
                }, { quoted: raw });
            }
            await persist();
            return sock.sendMessage(from, {
                text: t('guild_left', lang),
            }, { quoted: raw });
        }

        return sock.sendMessage(from, {
            text: t('guild_need_name', lang),
        }, { quoted: raw });
    });
