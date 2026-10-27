import { plugin } from '../../src/core/plugin.js';
import { getCharacter, setLanguage, persist, t, pickLang } from '../../src/rpg/index.js';

export default plugin('setlang', 'rpgLang', 'bahasa')
    .in('rpg')
    .desc('Change RPG language (en/id)')
    .prefixOnly()
    .signal('User wants to change RPG language', ['.setlang en', '.setlang id', '.bahasa id'])
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

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const lang = pickLang(parts[0]);

        if (!lang) {
            return reply([
                    `🌐 *RPG Language / Bahasa RPG*`,
                    ``,
                    `Current: *${char.lang === 'en' ? 'English' : 'Indonesia'}*`,
                    ``,
                    `Usage:`,
                    `*.setlang en*  — English`,
                    `*.setlang id*  — Indonesia`,
                ].join('\n'));
        }

        setLanguage(char, lang);
        await persist();

        await reply(t('lang_changed', lang));
    });
