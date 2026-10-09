import { exec } from 'child_process';
import { promisify, inspect } from 'util';
import {
    logger,
    sendMess,
    routeSessionInput,
    getGroupMeta,
    detectDevice,
    msg
} from './lib/index.js';
import { loadDb, saveDb, ensureUser, ensureGroup } from './core/db.js';
import { handleAI } from './ai/index.js';
import { plugins } from './core/loader.js';
import { resolveIdentity, buildQuoted, mergeAlternateUser, resolvePermissions } from './core/identity.js';
import { enforceAntilink, processAfk } from './core/groupGuards.js';
import { executeCommand } from './core/pipeline.js';
import { isTarget, handleAttempt } from './core/praiseGate.js';

export { participantsUpdate, getCaptchaPending } from './core/groupEvents.js';

const execPromise = promisify(exec);

const PREFIX_PATTERN     = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^<>:;\\/(){}\[\]\-,]/;
const BAN_NOTICE_TTL     = 10 * 60_000;
const banNoticeCooldown  = new Map();
const LANG_CHOICES       = { lang_en: 'en', lang_id: 'id' };

function extractText(m, waMsg) {
    return m.body
        || waMsg?.documentMessage?.caption
        || waMsg?.documentWithCaptionMessage?.message?.documentMessage?.caption
        || '';
}

function parseCommand(body) {
    const prefix = PREFIX_PATTERN.exec(body)?.[0] ?? null;
    if (prefix === null) return { prefix, isCmd: false, command: '' };
    return {
        prefix,
        isCmd: true,
        command: body.slice(prefix.length).trim().split(/\s+/).shift().toLowerCase()
    };
}

async function loadGroupState(sock, from, isGroup) {
    if (!isGroup) return { groupMetadata: null, participants: [], adminEntries: [], admins: [] };
    const groupMetadata = await getGroupMeta(sock, from);
    const participants  = groupMetadata?.participants || [];
    const adminEntries  = participants.filter(v => v.admin !== null);
    return { groupMetadata, participants, adminEntries, admins: adminEntries.map(v => v.id) };
}

async function passesGates(sock, { db, from, body, raw, primaryId, isCmd, isGroup, isOwner, isAdmin }) {
    if (db.users[primaryId]?.banned && !isOwner) {
        const last = banNoticeCooldown.get(primaryId) || 0;
        if (isCmd && Date.now() - last > BAN_NOTICE_TTL) {
            banNoticeCooldown.set(primaryId, Date.now());
            await sock.sendMessage(from, { text: msg('sys.banned') });
        }
        return false;
    }

    if (isGroup && db.groups[from]?.mute && !isOwner && !isAdmin) return false;

    if (db.settings?.maintenance && !isOwner) {
        await sock.sendMessage(from, { text: msg('sys.maintenance') });
        return false;
    }

    const mode = db.settings?.mode || 'public';
    if (mode === 'private' && !isOwner) return false;
    if (mode === 'group' && !isGroup && !isOwner) return false;

    return true;
}

async function runOwnerShell(sock, from, body, scope) {
    if (body.startsWith('$ ')) {
        try {
            const { stdout, stderr } = await execPromise(body.slice(2));
            await sock.sendMessage(from, { text: stdout || stderr || 'Done.' });
        } catch (err) {
            await sock.sendMessage(from, { text: err.message });
        }
        return true;
    }

    if (body.startsWith('>> ')) {
        const code = body.slice(3);
        try {
            const { sock: _s, ...vars } = scope;
            const names = Object.keys(vars);
            const fn = new (Object.getPrototypeOf(async () => {}).constructor)(
                'sock', ...names,
                code.includes('return') ? code : `return ${code}`
            );
            let result = await fn(sock, ...names.map(n => vars[n]));
            if (typeof result !== 'string') result = inspect(result);
            await sock.sendMessage(from, { text: result });
        } catch (err) {
            await sock.sendMessage(from, { text: String(err) });
        }
        return true;
    }

    return false;
}

async function handleLanguagePick(sock, { body, db, primaryId, from, raw }) {
    const chosen = LANG_CHOICES[body.trim().toLowerCase()];
    if (!chosen) return false;
    if (db.users[primaryId]) {
        db.users[primaryId].lang = chosen;
        await saveDb();
    }
    await sock.sendMessage(from, { text: msg(`lang.set_${chosen}`) }, { quoted: raw });
    return true;
}

async function handleStickerCommand(sock, ctx) {
    const { waMsg, db, m, baseCtx, primaryId, pushname } = ctx;
    if (!waMsg?.stickerMessage) return false;

    const hash    = Buffer.from(waMsg.stickerMessage.fileSha256 || []).toString('hex');
    const command = db.settings?.stickerCmds?.[hash];
    const plugin  = command && plugins.get(command);
    if (!plugin) return false;

    await executeCommand(sock, {
        plugin, command, label: `[stiker] ${command}`, m, baseCtx, db, primaryId, pushname
    });
    return true;
}

export async function handler(sock, m) {
    const { from, sender, pushname, raw } = m;
    const waMsg = raw.message;
    const body  = extractText(m, waMsg);

    if (!body && !waMsg?.imageMessage && !waMsg?.videoMessage && !waMsg?.stickerMessage) return;

    const isGroup = from.endsWith('@g.us');
    const type    = Object.keys(waMsg || {})[0];
    const ctx     = waMsg?.[type]?.contextInfo || waMsg?.extendedTextMessage?.contextInfo;

    const { isCmd, command } = parseCommand(body);

    const identity = resolveIdentity(sock, m);
    const { lid, jid, primaryId, altId, senderIds, botNumber } = identity;
    if (!primaryId) return;

    m.quoted = buildQuoted(ctx, from, [sock.user?.id, sock.user?.lid].filter(Boolean));

    const mentionedJid = ctx?.mentionedJid || [];
    const isMentioned  = mentionedJid.some(j => j.includes(botNumber.split('@')[0]));

    const db = await loadDb();
    for (const bad of ['null', 'undefined']) {
        delete db.users[bad];
        delete db.groups[bad];
    }

    mergeAlternateUser(db, primaryId, altId);
    ensureUser(db, primaryId, m);
    if (jid) db.users[primaryId].jid = jid;
    if (lid) db.users[primaryId].lid = lid;
    if (isGroup) ensureGroup(db, from);

    if (isGroup && (body || waMsg?.imageMessage || waMsg?.videoMessage || waMsg?.stickerMessage || waMsg?.audioMessage)) {
        const grp = db.groups[from];
        if (grp) {
            if (!grp.activity || typeof grp.activity !== 'object') grp.activity = {};
            const slot = grp.activity[primaryId] || { count: 0, lastAt: 0, firstAt: Date.now() };
            if (!slot.firstAt) slot.firstAt = Date.now();
            slot.count = (slot.count || 0) + 1;
            slot.lastAt = Date.now();
            grp.activity[primaryId] = slot;
            saveDb();
        }
    }

    global.db = db;

    const { groupMetadata, participants, adminEntries, admins } = await loadGroupState(sock, from, isGroup);
    const { isOwner, isAdmin, isBotAdmin } = resolvePermissions({ senderIds, botNumber, adminEntries, isGroup });

    logger.debug(`[owner-check] primaryId=${primaryId} lid=${lid} jid=${jid} senderIds=${JSON.stringify(senderIds)} global.owner=${global.owner} global.ownerLid=${global.ownerLid || '(not resolved yet)'} → isOwner=${isOwner}`);

    if (!await passesGates(sock, { db, from, body, raw, primaryId, isCmd, isGroup, isOwner, isAdmin })) return;

    if (isGroup && db.groups[from]?.antilink && isBotAdmin && !isOwner && !isAdmin) {
        if (await enforceAntilink(sock, { from, raw, body, primaryId })) return;
    }

    if (isGroup && db.groups[from]) {
        await processAfk(sock, {
            from,
            grp: db.groups[from],
            body,
            primaryId,
            mentionedJid,
            quotedSender: m.quoted?.sender
        });
    }

    const baseCtx = {
        body, raw, from,
        db:  db.users[primaryId],
        gdb: db,
        isOwner, isAdmin, isBotAdmin, isGroup, isMentioned,
        participants, admins, groupMetadata,
        senderIds, primaryId, botNumber,
        mentionedJid, sendMess, pushname, saveDb,
        device: m.device || detectDevice(raw),
        reply: (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: raw })
    };

    if (!isOwner && body && isTarget(senderIds) && !(isCmd && plugins.has(command))) {
        if (await handleAttempt(sock, { from, raw, primaryId, body })) return;
    }

    if (body && await routeSessionInput(sock, primaryId, body, { ...baseCtx, message: m })) {
        db.users[primaryId].hit = (db.users[primaryId].hit || 0) + 1;
        await saveDb();
        return;
    }

    const pipeline = { waMsg, db, m, baseCtx, primaryId, pushname };

    if (await handleStickerCommand(sock, pipeline)) return;

    if (isOwner && await runOwnerShell(sock, from, body, {
        sock, m, raw, from, body, db, isOwner, isAdmin, isGroup, primaryId, participants, groupMetadata, plugins
    })) return;

    if (await handleLanguagePick(sock, { body, db, primaryId, from, raw })) return;

    if (isCmd && plugins.has(command)) {
        return executeCommand(sock, { plugin: plugins.get(command), command, m, baseCtx, db, primaryId, pushname });
    }

    if (body) logger.chat(primaryId, body, { isGroup, groupName: groupMetadata?.subject });

    if (!isCmd || !isGroup) {
        await handleAI(sock, m, { ...baseCtx, m });
    }
}
