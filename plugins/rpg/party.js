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
    .run(async (sock, { primaryId, gdb, body, message, mentionedJid, reply }) => {
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
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const action = (parts[0] || '').toLowerCase();

        if (!action || action === 'info') {
            const party = getParty(gdb, char);
            return reply(buildPartyText(gdb, party, lang) + '\n\n' +
                    (lang === 'en'
                        ? '*.party create / invite / accept / leave*'
                        : '*.party create / invite / accept / leave*'));
        }

        if (action === 'create' || action === 'buat') {
            const result = createParty(gdb, primaryId, char);
            if (!result.ok) {
                return reply(t('party_in', lang));
            }
            await persist();
            return reply(t('party_created', lang));
        }

        if (action === 'invite' || action === 'undang') {
            const party = getParty(gdb, char);
            if (!party) {
                return reply(t('party_no', lang));
            }

            const targetId = resolveTargetId({ message, mentionedJid, primaryId, body });
            if (!targetId) {
                return reply(lang === 'en' ? '❌ Tag or reply to invite.' : '❌ Tag atau reply untuk undang.');
            }

            const found = findUserInDb(gdb, targetId);
            if (!found) {
                return reply(t('no_target', lang));
            }

            const targetChar = getCharacter(found.user);
            if (!targetChar) {
                return reply(t('target_no_rpg', lang));
            }

            const result = inviteToParty(gdb, party, primaryId, found.id);
            if (!result.ok) {
                const map = {
                    NOT_LEADER: t('party_not_leader', lang),
                    ALREADY_MEMBER: t('party_in', lang),
                    FULL: t('party_full', lang),
                };
                return reply(map[result.reason] || `❌ ${result.reason}`);
            }

            await persist();
            const name = displayName(gdb, found.id, 'Player');
            return reply(t('party_invited', lang, name));
        }

        if (action === 'accept' || action === 'terima') {
            const result = acceptInvite(gdb, primaryId, char);
            if (!result.ok) {
                const map = {
                    IN_PARTY: t('party_in', lang),
                    NO_INVITE: t('party_no_invite', lang),
                    FULL: t('party_full', lang),
                };
                return reply(map[result.reason] || `❌ ${result.reason}`);
            }
            await persist();
            return reply(t('party_accepted', lang));
        }

        if (action === 'leave' || action === 'keluar') {
            const result = leaveParty(gdb, primaryId, char);
            if (!result.ok) {
                return reply(t('party_no', lang));
            }
            await persist();
            return reply(t('party_left', lang));
        }

        return reply(lang === 'en'
                ? '*.party* · create · invite · accept · leave'
                : '*.party* · create · invite · accept · leave');
    });
