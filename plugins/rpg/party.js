import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    createParty,
    inviteToParty,
    acceptInvite,
    leaveParty,
    getParty,
    buildPartyText,
    resolveTargetId,
    findUserInDb,
    displayName,
} from '../../src/rpg/index.js';

export default plugin('party', 'tim')
    .in('rpg')
    .desc('Party system — create, invite, accept, leave')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants party create invite accept leave', [
        '.party',
        '.party create',
        '.party invite @user',
        '.party accept',
        '.party leave',
    ])
    .run(async (sock, { raw, from, primaryId, gdb, body, message, mentionedJid }) => {
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
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const action = (parts[0] || '').toLowerCase();

        if (!action || action === 'info') {
            const party = getParty(gdb, char);
            return sock.sendMessage(from, {
                text: buildPartyText(gdb, party, lang) + '\n\n' +
                    (lang === 'en'
                        ? '*.party create / invite / accept / leave*'
                        : '*.party create / invite / accept / leave*'),
            }, { quoted: raw });
        }

        if (action === 'create' || action === 'buat') {
            const result = createParty(gdb, primaryId, char);
            if (!result.ok) {
                return sock.sendMessage(from, {
                    text: t('party_in', lang),
                }, { quoted: raw });
            }
            await persist();
            return sock.sendMessage(from, {
                text: t('party_created', lang),
            }, { quoted: raw });
        }

        if (action === 'invite' || action === 'undang') {
            const party = getParty(gdb, char);
            if (!party) {
                return sock.sendMessage(from, {
                    text: t('party_no', lang),
                }, { quoted: raw });
            }

            const targetId = resolveTargetId({ message, mentionedJid, primaryId, body });
            if (!targetId) {
                return sock.sendMessage(from, {
                    text: lang === 'en' ? '❌ Tag or reply to invite.' : '❌ Tag atau reply untuk undang.',
                }, { quoted: raw });
            }

            const found = findUserInDb(gdb, targetId);
            if (!found) {
                return sock.sendMessage(from, {
                    text: t('no_target', lang),
                }, { quoted: raw });
            }

            const targetChar = getCharacter(found.user);
            if (!targetChar) {
                return sock.sendMessage(from, {
                    text: t('target_no_rpg', lang),
                }, { quoted: raw });
            }

            const result = inviteToParty(gdb, party, primaryId, found.id);
            if (!result.ok) {
                const map = {
                    NOT_LEADER: t('party_not_leader', lang),
                    ALREADY_MEMBER: t('party_in', lang),
                    FULL: t('party_full', lang),
                };
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }

            await persist();
            const name = displayName(gdb, found.id, 'Player');
            return sock.sendMessage(from, {
                text: t('party_invited', lang, name),
            }, { quoted: raw });
        }

        if (action === 'accept' || action === 'terima') {
            const result = acceptInvite(gdb, primaryId, char);
            if (!result.ok) {
                const map = {
                    IN_PARTY: t('party_in', lang),
                    NO_INVITE: t('party_no_invite', lang),
                    FULL: t('party_full', lang),
                };
                return sock.sendMessage(from, {
                    text: map[result.reason] || `❌ ${result.reason}`,
                }, { quoted: raw });
            }
            await persist();
            return sock.sendMessage(from, {
                text: t('party_accepted', lang),
            }, { quoted: raw });
        }

        if (action === 'leave' || action === 'keluar') {
            const result = leaveParty(gdb, primaryId, char);
            if (!result.ok) {
                return sock.sendMessage(from, {
                    text: t('party_no', lang),
                }, { quoted: raw });
            }
            await persist();
            return sock.sendMessage(from, {
                text: t('party_left', lang),
            }, { quoted: raw });
        }

        return sock.sendMessage(from, {
            text: lang === 'en'
                ? '*.party* · create · invite · accept · leave'
                : '*.party* · create · invite · accept · leave',
        }, { quoted: raw });
    });
