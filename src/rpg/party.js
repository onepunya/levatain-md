import { randomBytes } from 'crypto';
import { displayName } from './names.js';

export const MAX_PARTY = 4;

export function ensureParties(db) {
    if (!db.parties || typeof db.parties !== 'object') db.parties = {};
}

function newId() {
    return 'p_' + randomBytes(4).toString('hex');
}

export function getParty(db, char) {
    ensureParties(db);
    if (!char.partyId) return null;
    return db.parties[char.partyId] || null;
}

export function createParty(db, leaderId, leaderChar) {
    ensureParties(db);
    if (leaderChar.partyId && db.parties[leaderChar.partyId]) {
        return { ok: false, reason: 'IN_PARTY' };
    }
    const id = newId();
    db.parties[id] = {
        id,
        leader: leaderId,
        members: [leaderId],
        invites: {},
        createdAt: Date.now(),
    };
    leaderChar.partyId = id;
    return { ok: true, party: db.parties[id] };
}

export function inviteToParty(db, party, fromId, targetId) {
    if (party.leader !== fromId) return { ok: false, reason: 'NOT_LEADER' };
    if (party.members.includes(targetId)) return { ok: false, reason: 'ALREADY_MEMBER' };
    if (party.members.length >= MAX_PARTY) return { ok: false, reason: 'FULL' };
    party.invites[targetId] = Date.now();
    return { ok: true };
}

export function acceptInvite(db, targetId, targetChar) {
    ensureParties(db);
    if (targetChar.partyId && db.parties[targetChar.partyId]) {
        return { ok: false, reason: 'IN_PARTY' };
    }
    let found = null;
    for (const party of Object.values(db.parties)) {
        if (party.invites && party.invites[targetId]) {
            found = party;
            break;
        }
    }
    if (!found) return { ok: false, reason: 'NO_INVITE' };
    if (found.members.length >= MAX_PARTY) return { ok: false, reason: 'FULL' };

    delete found.invites[targetId];
    found.members.push(targetId);
    targetChar.partyId = found.id;
    return { ok: true, party: found };
}

export function leaveParty(db, userId, char) {
    ensureParties(db);
    const party = getParty(db, char);
    if (!party) return { ok: false, reason: 'NO_PARTY' };

    party.members = party.members.filter((id) => id !== userId);
    delete party.invites[userId];
    char.partyId = null;

    if (party.members.length === 0) {
        delete db.parties[party.id];
        return { ok: true, disbanded: true };
    }

    if (party.leader === userId) {
        party.leader = party.members[0];
    }
    return { ok: true, disbanded: false, party };
}

export function partyExpBonus(memberCount) {
    if (memberCount >= 4) return 0.2;
    if (memberCount >= 3) return 0.12;
    if (memberCount >= 2) return 0.08;
    return 0;
}

export function buildPartyText(db, party, lang = 'id') {
    if (!party) {
        return lang === 'en'
            ? '_Not in a party_\n*.party create* to start'
            : '_Tidak dalam party_\n*.party create* untuk membuat';
    }

    const leaderName = displayName(db, party.leader);
    const memberLines = party.members.map((id, i) => {
        const name = displayName(db, id);
        const tag = id === party.leader ? ' 👑' : '';
        return `  ${i + 1}. *${name}*${tag}`;
    });

    return [
        lang === 'en' ? `👥 *Party* (${party.members.length}/${MAX_PARTY})` : `👥 *Party* (${party.members.length}/${MAX_PARTY})`,
        lang === 'en' ? `Leader: *${leaderName}*` : `Leader: *${leaderName}*`,
        ``,
        lang === 'en' ? `*Members*` : `*Anggota*`,
        ...memberLines,
        ``,
        lang === 'en'
            ? `Bonus EXP: +${Math.round(partyExpBonus(party.members.length) * 100)}%`
            : `Bonus EXP: +${Math.round(partyExpBonus(party.members.length) * 100)}%`,
    ].join('\n');
}
