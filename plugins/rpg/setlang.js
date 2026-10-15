import { plugin } from '../../src/core/plugin.js';
import { getCharacter, setLanguage, persist, t, pickLang } from '../../src/rpg/index.js';

export default plugin('setlang', 'rpgLang', 'bahasa')
    .in('rpg')
    .desc('Change RPG language (en/id)')
    .prefixOnly()
    .signal('User wants to change RPG language', ['.setlang en', '.setlang id', '.bahasa id'])
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

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const lang = pickLang(parts[0]);

        if (!lang) {
            return sock.sendMessage(from, {
                text: [
                    `🌐 *RPG Language / Bahasa RPG*`,
                    ``,
                    `Current: *${char.lang === 'en' ? 'English' : 'Indonesia'}*`,
                    ``,
                    `Usage:`,
                    `*.setlang en*  — English`,
                    `*.setlang id*  — Indonesia`,
                ].join('\n'),
            }, { quoted: raw });
        }

        setLanguage(char, lang);
        await persist();

        await sock.sendMessage(from, {
            text: t('lang_changed', lang),
        }, { quoted: raw });
    });
