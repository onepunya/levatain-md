import { randomBytes } from 'crypto';
import { displayName } from './names.js';

export const MAX_GUILD = 20;
export const GUILD_CREATE_COST = 500;

export function ensureGuilds(db) {
    if (!db.guilds || typeof db.guilds !== 'object') db.guilds = {};
}

function newId() {
    return 'g_' + randomBytes(4).toString('hex');
}

export function getGuild(db, char) {
    ensureGuilds(db);
    if (!char.guildId) return null;
    return db.guilds[char.guildId] || null;
}

export function createGuild(db, leaderId, leaderChar, name) {
    ensureGuilds(db);
    if (leaderChar.guildId && db.guilds[leaderChar.guildId]) {
        return { ok: false, reason: 'IN_GUILD' };
    }
    name = String(name || '').trim().slice(0, 20);
    if (name.length < 3) return { ok: false, reason: 'BAD_NAME' };
    if (!/^[a-zA-Z0-9 _\-]+$/.test(name)) return { ok: false, reason: 'BAD_NAME' };

    for (const g of Object.values(db.guilds)) {
        if (g.name.toLowerCase() === name.toLowerCase()) {
            return { ok: false, reason: 'NAME_TAKEN' };
        }
    }

    if ((leaderChar.aether || 0) < GUILD_CREATE_COST) {
        return { ok: false, reason: 'NO_MONEY', need: GUILD_CREATE_COST };
    }

    leaderChar.aether -= GUILD_CREATE_COST;
    const id = newId();
    db.guilds[id] = {
        id,
        name,
        leader: leaderId,
        members: [leaderId],
        createdAt: Date.now(),
    };
    leaderChar.guildId = id;
    return { ok: true, guild: db.guilds[id] };
}

export function joinGuild(db, userId, char, guildName) {
    ensureGuilds(db);
    if (char.guildId && db.guilds[char.guildId]) {
        return { ok: false, reason: 'IN_GUILD' };
    }
    const name = String(guildName || '').trim().toLowerCase();
    let guild = null;
    for (const g of Object.values(db.guilds)) {
        if (g.name.toLowerCase() === name) {
            guild = g;
            break;
        }
    }
    if (!guild) return { ok: false, reason: 'NOT_FOUND' };
    if (guild.members.length >= MAX_GUILD) return { ok: false, reason: 'FULL' };

    guild.members.push(userId);
    char.guildId = guild.id;
    return { ok: true, guild };
}

export function leaveGuild(db, userId, char) {
    ensureGuilds(db);
    const guild = getGuild(db, char);
    if (!guild) return { ok: false, reason: 'NO_GUILD' };

    guild.members = guild.members.filter((id) => id !== userId);
    char.guildId = null;

    if (guild.members.length === 0) {
        delete db.guilds[guild.id];
        return { ok: true, disbanded: true };
    }

    if (guild.leader === userId) {
        guild.leader = guild.members[0];
    }
    return { ok: true, disbanded: false, guild };
}

export function listGuilds(db) {
    ensureGuilds(db);
    return Object.values(db.guilds)
        .slice()
        .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}

export function buildGuildText(db, guild, lang = 'id') {
    if (!guild) {
        return lang === 'en'
            ? `_Not in a guild_\n*.guild create <name>* (${GUILD_CREATE_COST}Æ)\n*.guild join <name>*\n*.guild list*`
            : `_Tidak dalam guild_\n*.guild create <nama>* (${GUILD_CREATE_COST}Æ)\n*.guild join <nama>*\n*.guild list*`;
    }

    const leaderName = displayName(db, guild.leader);
    const memberLines = guild.members.slice(0, 15).map((id, i) => {
        const name = displayName(db, id);
        const tag = id === guild.leader ? ' 👑' : '';
        return `  ${i + 1}. *${name}*${tag}`;
    });
    if (guild.members.length > 15) {
        memberLines.push(`  … +${guild.members.length - 15}`);
    }

    return [
        `🏰 *${guild.name}*`,
        `Members: ${guild.members.length}/${MAX_GUILD}`,
        lang === 'en' ? `Leader: *${leaderName}*` : `Leader: *${leaderName}*`,
        ``,
        lang === 'en' ? `*Members*` : `*Anggota*`,
        ...memberLines,
    ].join('\n');
}

export function buildGuildListText(db, lang = 'id') {
    const list = listGuilds(db);
    if (!list.length) {
        return lang === 'en'
            ? '_No guilds yet_\n*.guild create <name>*'
            : '_Belum ada guild_\n*.guild create <nama>*';
    }

    const lines = list.slice(0, 20).map((g, i) => {
        const leaderName = displayName(db, g.leader);
        return `*${i + 1}.* 🏰 *${g.name}* — ${g.members.length}/${MAX_GUILD}\n    👑 ${leaderName}`;
    });

    return [
        lang === 'en' ? '🏰 *Guild List*' : '🏰 *Daftar Guild*',
        `━━━━━━━━━━━━━━━━`,
        ...lines,
        `━━━━━━━━━━━━━━━━`,
        lang === 'en'
            ? `*.guild join <name>* · Total: ${list.length}`
            : `*.guild join <nama>* · Total: ${list.length}`,
    ].join('\n');
}
