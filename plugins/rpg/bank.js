import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    formatAether,
    ensureBank,
    deposit,
    withdraw,
    depositAll,
    withdrawAll,
    BANK_MIN,
    BANK_MAX,
} from '../../src/rpg/index.js';

export default plugin('bank', 'bankaether', 'tabungan')
    .in('rpg')
    .desc('Bank — deposit and withdraw Aether')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants bank deposit withdraw savings', [
        '.bank',
        '.bank deposit 100',
        '.bank withdraw 50',
        '.bank deposit all',
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
        const action = (parts[0] || '').toLowerCase();
        const amountRaw = (parts[1] || '').toLowerCase();

        if (!action || action === 'status' || action === 'info') {
            return sock.sendMessage(from, {
                text: [
                    t('bank_title', lang),
                    `━━━━━━━━━━━━━━━━`,
                    t('bank_status', lang, formatAether(char.aether), formatAether(char.bank || 0)),
                    `━━━━━━━━━━━━━━━━`,
                    t('bank_help', lang),
                ].join('\n'),
            }, { quoted: raw });
        }

        if (action === 'deposit' || action === 'dep' || action === 'tabung' || action === 'simpan') {
            let result;
            if (amountRaw === 'all' || amountRaw === 'semua') {
                result = depositAll(char);
            } else {
                result = deposit(char, amountRaw);
            }

            if (!result.ok) {
                const map = {
                    MIN: t('bank_min', lang, formatAether(BANK_MIN)),
                    NO_MONEY: t('no_money', lang, formatAether(result.have !== undefined ? amountRaw : BANK_MIN), formatAether(result.have || 0)),
                    BANK_FULL: t('bank_full', lang, formatAether(BANK_MAX)),
                };
                if (result.reason === 'NO_MONEY') {
                    return sock.sendMessage(from, {
                        text: t('no_money', lang, formatAether(Math.floor(Number(amountRaw) || BANK_MIN)), formatAether(result.have || 0)),
                    }, { quoted: raw });
                }
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();
            return sock.sendMessage(from, {
                text: t('bank_deposit_ok', lang, formatAether(result.amount), formatAether(result.wallet), formatAether(result.bank)),
            }, { quoted: raw });
        }

        if (action === 'withdraw' || action === 'wd' || action === 'tarik' || action === 'ambil') {
            let result;
            if (amountRaw === 'all' || amountRaw === 'semua') {
                result = withdrawAll(char);
            } else {
                result = withdraw(char, amountRaw);
            }

            if (!result.ok) {
                if (result.reason === 'MIN') {
                    return sock.sendMessage(from, {
                        text: t('bank_min', lang, formatAether(BANK_MIN)),
                    }, { quoted: raw });
                }
                if (result.reason === 'NO_BANK') {
                    return sock.sendMessage(from, {
                        text: t('bank_no', lang, formatAether(result.have || 0)),
                    }, { quoted: raw });
                }
                return sock.sendMessage(from, {
                    text: `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();
            return sock.sendMessage(from, {
                text: t('bank_withdraw_ok', lang, formatAether(result.amount), formatAether(result.wallet), formatAether(result.bank)),
            }, { quoted: raw });
        }

        return sock.sendMessage(from, {
            text: t('bank_help', lang),
        }, { quoted: raw });
    });
