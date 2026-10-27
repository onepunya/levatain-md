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

        const lang = char.lang || 'id';
        ensureBank(char);

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const mode = (parts[0] || '').toLowerCase();

        if (!mode || mode === 'help') {
            return reply(t('gamble_help', lang));
        }

        if (mode === 'coin' || mode === 'koin' || mode === 'flip') {
            const cd = canGamble(primaryId);
            if (!cd.ok) {
                return reply(t('gamble_cd', lang, formatGambleWait(cd.waitMs)));
            }

            const betRaw = parts[1];
            const pick = parts[2];
            const bet = parseBet(betRaw, char.aether);

            if (!bet.ok) {
                if (bet.reason === 'MIN') {
                    return reply(t('bank_min', lang, formatAether(GAMBLE_MIN)));
                }
                if (bet.reason === 'MAX') {
                    return reply(t('gamble_max', lang, formatAether(GAMBLE_MAX)));
                }
                if (bet.reason === 'NO_MONEY') {
                    return reply(t('no_money', lang, formatAether(Math.floor(Number(betRaw) || 0)), formatAether(bet.have || 0)));
                }
            }

            if (!pick) {
                return reply(t('gamble_bad_pick', lang) + '\n' + t('gamble_help', lang));
            }

            const result = coinFlip(char, bet.amount, pick);
            if (!result.ok) {
                return reply(t('gamble_bad_pick', lang));
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
                return reply(t('gamble_win', lang, pickLabel, resultLabel, formatAether(result.payout), formatAether(result.wallet)));
            }

            return reply(t('gamble_lose', lang, pickLabel, resultLabel, formatAether(result.amount), formatAether(result.wallet)));
        }

        return reply(t('gamble_help', lang));
    });
