import { plugin } from '../../src/core/plugin.js';
import {
    hasCharacter,
    createCharacter,
    persist,
    formatAether,
    CLASSES,
    CLASS_LIST,
    t,
    pickLang,
    safeCharName,
} from '../../src/rpg/index.js';

export default plugin('start', 'create', 'buatkarakter')
    .in('rpg')
    .desc('Create RPG character')
    .prefixOnly()
    .cooldown(5)
    .signal('User wants to create RPG character or start the game', [
        '.start swordman id',
        '.start mage en',
        '.create archer id',
    ])
    .run(async (sock, { primaryId, gdb, pushname, body, reply }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return reply(t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'));
        }

        if (hasCharacter(user)) {
            const lang = user.rpg?.lang || 'id';
            return reply(t('already_started', lang));
        }

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const classRaw = (parts[0] || '').toLowerCase();
        const langRaw = parts[1];

        if (!classRaw || !CLASS_LIST.includes(classRaw)) {
            const list = CLASS_LIST.map((id) => {
                const c = CLASSES[id];
                return `  ${c.emoji} *.start ${id} id*  /  *.start ${id} en*`;
            }).join('\n');

            return reply([
                    `⚔️ *Create Character / Buat Karakter*`,
                    ``,
                    `Format: *.start <class> <lang>*`,
                    ``,
                    `*Classes:*`,
                    list,
                    ``,
                    `*lang* = \`id\` (Indonesia) or \`en\` (English)`,
                    ``,
                    `Example:`,
                    `*.start swordman id*`,
                    `*.start mage en*`,
                ].join('\n'));
        }

        const lang = pickLang(langRaw);
        if (!lang) {
            return reply(t('invalid_lang', 'id') + '\n' + t('invalid_lang', 'en'));
        }

        const name = safeCharName({}, { username: user.username, name: user.name || pushname }, 'Adventurer');
        const char = createCharacter(user, { classId: classRaw, lang, name });
        await persist();

        const cls = CLASSES[classRaw];
        const className = cls.name[lang];
        const msg = t('start_success', lang, char.name, className, formatAether(char.aether));

        await reply(msg);
    });
