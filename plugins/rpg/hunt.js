import { plugin } from '../../src/core/plugin.js';
import { ProgressMessage } from '../../src/wa/index.js';
import {
    getCharacter,
    persist,
    formatAether,
    t,
    isHunting,
    setHunting,
    canHunt,
    resolveBattle,
    formatWaitShort,
    generateLevelUpImage,
    MONSTERS,
    MONSTER_LIST,
    getItem,
} from '../../src/rpg/index.js';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export default plugin('hunt', 'berburu', 'battle', 'fight')
    .in('rpg')
    .desc('Hunt monsters for EXP and Aether')
    .prefixOnly()
    .cooldown(3)
    .signal('User wants to hunt monsters or battle in RPG', [
        '.hunt',
        '.hunt slime',
        '.berburu',
        '.battle wolf',
    ])
    .run(async (sock, { raw, from, primaryId, gdb, body, reply }) => {
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

        if (isHunting(primaryId)) {
            return reply(t('hunt_busy', lang));
        }

        const cd = canHunt(char);
        if (!cd.ok) {
            return reply(t('hunt_cooldown', lang, formatWaitShort(cd.waitMs)));
        }

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const preferred = (parts[0] || '').toLowerCase() || null;

        if (preferred && !MONSTER_LIST.includes(preferred)) {
            const list = MONSTER_LIST.map((id) => {
                const m = MONSTERS[id];
                return `  ${m.emoji} *${id}* (Lv ${m.minLevel}–${m.maxLevel})`;
            }).join('\n');
            return reply([
                    lang === 'en' ? '*Available monsters:*' : '*Monster tersedia:*',
                    list,
                    '',
                    lang === 'en'
                        ? 'Usage: *.hunt* or *.hunt <monster>*'
                        : 'Cara: *.hunt* atau *.hunt <monster>*',
                ].join('\n'));
        }

        setHunting(primaryId, true);
        const bar = new ProgressMessage(sock, from, raw, 1800);

        try {
            await bar.start(t('hunt_search', lang));
            await sleep(1500);

            const result = resolveBattle(char, preferred);

            if (result.error === 'TOO_WEAK') {
                const m = result.monster;
                const name = m.name[lang] || m.name.en;
                await bar.fail(t('hunt_too_weak', lang, name, m.minLevel));
                return;
            }

            const mon = result.monster;
            const monName = mon.name[lang] || mon.name.en;

            await bar.update(t('hunt_found', lang, mon.emoji, monName, mon.hp), 25);
            await sleep(1200);

            const sampleTurns = Math.min(result.turns, 4);
            for (let i = 1; i <= sampleTurns; i++) {
                const pct = 25 + Math.floor((i / sampleTurns) * 55);
                const pHp = Math.max(0, result.playerHpMax - Math.floor((result.playerHpMax - result.playerHpLeft) * (i / sampleTurns)));
                const mHp = Math.max(0, mon.hp - Math.floor(mon.hp * (i / sampleTurns) * (result.won ? 1 : 0.7)));
                await bar.update(t('hunt_fighting', lang, i, pHp, mHp), pct);
                await sleep(900);
            }

            await persist();

            let finalText;
            if (result.won) {
                finalText = t(
                    'hunt_win',
                    lang,
                    mon.emoji,
                    monName,
                    result.expGain,
                    formatAether(result.aetherGain),
                    result.turns,
                );
            } else if (result.fled) {
                finalText = t('hunt_flee', lang, mon.emoji, monName, result.expGain);
            } else {
                finalText = t('hunt_lose', lang, mon.emoji, monName, result.expGain);
            }

            if (result.drops?.length) {
                const dropNames = result.drops.map((id) => {
                    const it = getItem(id);
                    if (!it) return id;
                    return `${it.emoji} ${it.name[lang] || it.name.en}`;
                });
                finalText += '\n' + t('drop_line', lang, dropNames.join(', '));
            }

            if (result.levelResult?.leveled) {
                finalText += `\n\n🎉 *LEVEL UP!* ${result.levelResult.oldLevel} → ${result.levelResult.newLevel}`;
            }

            await bar.done(finalText);

            if (result.levelResult?.leveled) {
                try {
                    const img = await generateLevelUpImage(char, {
                        oldLevel: result.levelResult.oldLevel,
                        newLevel: result.levelResult.newLevel,
                    });
                    await reply({
                        image: img,
                        caption: t('level_up_caption', lang, result.levelResult.oldLevel, result.levelResult.newLevel),
                    });
                } catch {
                }
            }
        } catch (e) {
            try {
                await bar.fail(`❌ ${e.message || 'Hunt failed'}`);
            } catch {
                await reply(`❌ ${e.message || 'Hunt failed'}`);
            }
        } finally {
            setHunting(primaryId, false);
        }
    });
