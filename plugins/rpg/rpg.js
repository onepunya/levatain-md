import { plugin } from '../../src/core/plugin.js';
import {
    CLASSES,
    CLASS_LIST,
    STARTING_AETHER,
    DAILY_AETHER,
    formatAether,
    MONSTERS,
    MONSTER_LIST,
    GUILD_CREATE_COST,
} from '../../src/rpg/index.js';

export default plugin('rpg')
    .in('rpg')
    .desc('Levatain RPG — info & overview (EN + ID)')
    .prefixOnly()
    .signal('User asks about RPG system or wants RPG info', ['.rpg', 'apa itu rpg', 'how does rpg work'])
    .run(async (sock, { raw, from }) => {
        const classLines = CLASS_LIST.map((id) => {
            const c = CLASSES[id];
            return `  ${c.emoji} *${c.name.en}*`;
        }).join('\n');

        const monLines = MONSTER_LIST.map((id) => {
            const m = MONSTERS[id];
            return `  ${m.emoji} *${id}* Lv${m.minLevel}–${m.maxLevel}`;
        }).join('\n');

        const text = [
            `⚔️ *LEVATAIN RPG*`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `🇬🇧 Toram-inspired economy & RPG`,
            `🇮🇩 Ekonomi & RPG inspirasi Toram`,
            ``,
            `*Classes*`,
            classLines,
            ``,
            `*Monsters*`,
            monLines,
            ``,
            `💰 Start ${formatAether(STARTING_AETHER)} · Daily ${formatAether(DAILY_AETHER)}`,
            `🏰 Guild create: ${formatAether(GUILD_CREATE_COST)}`,
            ``,
            `*Commands*`,
            `*.start* *.profile* *.daily* *.balance* *.setlang*`,
            `*.hunt* *.inv* *.equip* *.unequip*`,
            `*.shop* *.buy* *.sell* *.pay* *.give*`,
            `*.quest* *.party* *.guild* *.lb* *.bank* *.judi*`,
            ``,
            `_Phase 1–5 complete_`,
        ].join('\n');

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
