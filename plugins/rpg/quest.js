import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    formatAether,
    ensureQuests,
    claimQuest,
    buildQuestText,
    generateLevelUpImage,
} from '../../src/rpg/index.js';

export default plugin('quest', 'quests', 'misi')
    .in('rpg')
    .desc('View or claim daily quests')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to see or claim RPG quests', ['.quest', '.quest claim hunt_3'])
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
        ensureQuests(char);

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const action = (parts[0] || '').toLowerCase();
        const questId = (parts[1] || '').toLowerCase();

        if (action === 'claim' || action === 'klaim') {
            if (!questId) {
                return sock.sendMessage(from, {
                    text: t('quest_need', lang),
                }, { quoted: raw });
            }

            const result = claimQuest(char, questId);
            if (!result.ok) {
                const map = {
                    INVALID: t('quest_need', lang),
                    CLAIMED: t('quest_claimed', lang),
                    INCOMPLETE: t('quest_incomplete', lang, result.prog, result.target),
                };
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();

            const name = result.def.name[lang] || result.def.name.en;
            let text = t('quest_claim_ok', lang, name, result.exp, formatAether(result.aether));

            if (result.levelResult?.leveled) {
                text += `\n🎉 LEVEL UP! ${result.levelResult.oldLevel} → ${result.levelResult.newLevel}`;
            }

            await sock.sendMessage(from, { text }, { quoted: raw });

            if (result.levelResult?.leveled) {
                try {
                    const img = await generateLevelUpImage(char, {
                        oldLevel: result.levelResult.oldLevel,
                        newLevel: result.levelResult.newLevel,
                    });
                    await sock.sendMessage(from, {
                        image: img,
                        caption: t('level_up_caption', lang, result.levelResult.oldLevel, result.levelResult.newLevel),
                    }, { quoted: raw });
                } catch {}
            }
            return;
        }

        const text = [
            t('quest_title', lang),
            `━━━━━━━━━━━━━━━━`,
            buildQuestText(char, lang),
            `━━━━━━━━━━━━━━━━`,
            t('quest_need', lang),
        ].join('\n');

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
