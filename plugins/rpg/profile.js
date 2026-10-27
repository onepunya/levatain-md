import { plugin } from '../../src/core/plugin.js';
import { getCharacter, buildProfile, t } from '../../src/rpg/index.js';

export default plugin('profile', 'me', 'profil', 'char')
    .in('rpg')
    .desc('View RPG character profile')
    .prefixOnly()
    .signal('User wants to see RPG profile or character stats', ['.profile', '.me', '.profil'])
    .run(async (sock, { primaryId, gdb, pushname, reply }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return reply(t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'));
        }

        const char = getCharacter(user);
        if (!char) {
            return reply(t('no_character', 'id'));
        }

        const text = buildProfile(char, user.username || pushname);
        await reply(text);
    });
