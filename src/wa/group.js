import { bustGroupMetaCache } from './groupCache.js';

async function updateParticipant(sock, groupId, jid, action) {
    const [res] = await sock.groupParticipantsUpdate(groupId, [jid], action);
    bustGroupMetaCache(groupId);
    return res;
}

export const kick = (sock, groupId, jid) => updateParticipant(sock, groupId, jid, 'remove');
export const promote = (sock, groupId, jid) => updateParticipant(sock, groupId, jid, 'promote');
export const demote = (sock, groupId, jid) => updateParticipant(sock, groupId, jid, 'demote');
export const addMember = (sock, groupId, jid) => updateParticipant(sock, groupId, jid, 'add');

export const MEMBER_ACTIONS = {
    kick: { run: kick, done: 'removed.' },
    promote: { run: promote, done: 'promoted to admin.' },
    demote: { run: demote, done: 'demoted from admin.' },
};

export const inviteLink = async (sock, groupId) => `https://chat.whatsapp.com/${await sock.groupInviteCode(groupId)}`;
export const inviteCode = (sock, groupId) => sock.groupInviteCode(groupId);
export const revokeInvite = (sock, groupId) => sock.groupRevokeInvite(groupId);
export const setSubject = (sock, groupId, text) => sock.groupUpdateSubject(groupId, text);
export const setDescription = (sock, groupId, text) => sock.groupUpdateDescription(groupId, text);
