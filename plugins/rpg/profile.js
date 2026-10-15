import { plugin } from '../../src/core/plugin.js';
import { getCharacter, buildProfile, t } from '../../src/rpg/index.js';

export default plugin('profile', 'me', 'profil', 'char')
    .in('rpg')
    .desc('View RPG character profile')
    .prefixOnly()
    .signal('User wants to see RPG profile or character stats', ['.profile', '.me', '.profil'])
    .run(async (sock, { raw, from, primaryId, gdb, pushname }) => {
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

        const text = buildProfile(char, user.username || pushname);
        await sock.sendMessage(from, { text }, { quoted: raw });
    });
