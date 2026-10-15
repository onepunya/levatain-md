import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    formatAether,
    ensureBank,
    canGamble,
    markGamble,
    parseBet,
    coinFlip,
    formatGambleWait,
    GAMBLE_MIN,
    GAMBLE_MAX,
} from '../../src/rpg/index.js';

export default plugin('judi', 'bet', 'gamble', 'coin')
    .in('rpg')
    .desc('Gamble Aether — coinflip')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to gamble or coinflip bet Aether', [
        '.judi coin 100 head',
        '.judi coin 50 gambar',
        '.bet coin 100 tail',
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
        ensureBank(char);

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const mode = (parts[0] || '').toLowerCase();

        if (!mode || mode === 'help') {
            return sock.sendMessage(from, {
                text: t('gamble_help', lang),
            }, { quoted: raw });
        }

        if (mode === 'coin' || mode === 'koin' || mode === 'flip') {
            const cd = canGamble(primaryId);
            if (!cd.ok) {
                return sock.sendMessage(from, {
                    text: t('gamble_cd', lang, formatGambleWait(cd.waitMs)),
                }, { quoted: raw });
            }

            const betRaw = parts[1];
            const pick = parts[2];
            const bet = parseBet(betRaw, char.aether);

            if (!bet.ok) {
                if (bet.reason === 'MIN') {
                    return sock.sendMessage(from, {
                        text: t('bank_min', lang, formatAether(GAMBLE_MIN)),
                    }, { quoted: raw });
                }
                if (bet.reason === 'MAX') {
                    return sock.sendMessage(from, {
                        text: t('gamble_max', lang, formatAether(GAMBLE_MAX)),
                    }, { quoted: raw });
                }
                if (bet.reason === 'NO_MONEY') {
                    return sock.sendMessage(from, {
                        text: t('no_money', lang, formatAether(Math.floor(Number(betRaw) || 0)), formatAether(bet.have || 0)),
                    }, { quoted: raw });
                }
            }

            if (!pick) {
                return sock.sendMessage(from, {
                    text: t('gamble_bad_pick', lang) + '\n' + t('gamble_help', lang),
                }, { quoted: raw });
            }

            const result = coinFlip(char, bet.amount, pick);
            if (!result.ok) {
                return sock.sendMessage(from, {
                    text: t('gamble_bad_pick', lang),
                }, { quoted: raw });
            }

            markGamble(primaryId);
            await persist();

            const pickLabel = result.pick === 'heads'
                ? (lang === 'en' ? 'Head' : 'Angka')
                : (lang === 'en' ? 'Tail' : 'Gambar');
            const resultLabel = result.result === 'heads'
                ? (lang === 'en' ? 'Head' : 'Angka')
                : (lang === 'en' ? 'Tail' : 'Gambar');

            if (result.win) {
                return sock.sendMessage(from, {
                    text: t('gamble_win', lang, pickLabel, resultLabel, formatAether(result.payout), formatAether(result.wallet)),
                }, { quoted: raw });
            }

            return sock.sendMessage(from, {
                text: t('gamble_lose', lang, pickLabel, resultLabel, formatAether(result.amount), formatAether(result.wallet)),
            }, { quoted: raw });
        }

        return sock.sendMessage(from, {
            text: t('gamble_help', lang),
        }, { quoted: raw });
    });
