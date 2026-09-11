import { exec } from 'child_process';
import { promisify } from 'util';
import { inspect } from 'util';
import { logger } from './lib/logger.js';
import { sendMess } from './lib/utils.js';
import { loadDb, saveDb, ensureUser, ensureGroup } from './core/db.js';
import { handleAI } from './ai/index.js';
import { plugins } from './core/loader.js';
import { routeSessionInput } from './lib/session.js';
import { getGroupMeta, bustGroupMetaCache } from './lib/groupCache.js';
import { detectDevice } from './lib/device.js';

const execPromise = promisify(exec);

const cooldowns = new Map();
const banNoticeCooldown = new Map();
const BAN_NOTICE_COOLDOWN = 10 * 60_000;

const formatAfkDuration = (ms) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec} detik`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} menit`;
    const jam = Math.floor(min / 60);
    if (jam < 24) return `${jam} jam`;
    return `${Math.floor(jam / 24)} hari`;
};

export async function handler(sock, m) {
    const { from, sender, pushname, raw } = m;
    const msg = raw.message;

    const body = m.body
        || msg?.documentMessage?.caption
        || msg?.documentWithCaptionMessage?.message?.documentMessage?.caption
        || '';

    if (!body && !msg?.imageMessage && !msg?.videoMessage && !msg?.stickerMessage) return;

    const isGroup = from.endsWith('@g.us');
    const type    = Object.keys(msg || {})[0];
    const ctx     = msg?.[type]?.contextInfo || msg?.extendedTextMessage?.contextInfo;

    const prefixMatch = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^<>:;\\/(){}\[\]\-,]/.exec(body);
    const prefix       = prefixMatch?.[0] ?? null;
    const isCmd         = prefix !== null;
    const command       = isCmd ? body.slice(prefix.length).trim().split(/\s+/).shift().toLowerCase() : '';

    const quotedMsg = ctx?.quotedMessage;
    const quotedParticipant = ctx?.participant || ctx?.remoteJid || from;
    const quotedParticipantAlt = ctx?.participantAlt || ctx?.participantPn;
    const botSelfIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
    m.quoted = quotedMsg ? {
        type:     Object.keys(quotedMsg)[0],
        sender:   quotedParticipant,
        text:     quotedMsg.conversation
                  || quotedMsg.extendedTextMessage?.text
                  || quotedMsg.imageMessage?.caption
                  || quotedMsg.videoMessage?.caption || '',
        fromMe:   botSelfIds.includes(quotedParticipant) || botSelfIds.includes(quotedParticipantAlt),
        stanzaId: ctx.stanzaId,
        raw:      { message: quotedMsg, contextInfo: ctx },
    } : null;

    const rawParticipant = raw.key.participant || raw.key.remoteJid || sender.id;
    const altParticipant = raw.key.participantAlt || raw.key.participantPn;
    const allCandidates   = [rawParticipant, altParticipant, sender.id].filter(Boolean);
    const lidRaw = allCandidates.find(v => v.includes('@lid'));
    const jidRaw = allCandidates.find(v => v.includes('@s.whatsapp.net'));
    const lid    = lidRaw ? lidRaw.split(':')[0].replace(/@.+/, '') + '@lid' : null;
    const jid    = jidRaw ? jidRaw.split(':')[0].replace(/@.+/, '') + '@s.whatsapp.net' : null;
    const primaryId  = lid || jid;
    const senderIds  = [lid, jid, sender.id].filter(v => v && !v.includes('undefined'));
    const botNumber  = sock.user?.id?.split(':')[0].replace(/@.+/, '') + '@s.whatsapp.net';
    const isMentioned = (ctx?.mentionedJid || []).some(j => j.includes(botNumber.split('@')[0]));

    if (!primaryId) return;

    const db = await loadDb();
    ['null', 'undefined'].forEach(bad => { delete db.users[bad]; delete db.groups[bad]; });

    const altId = primaryId === lid ? jid : lid;
    if (altId && db.users[altId] && !db.users[primaryId]) {
        db.users[primaryId] = db.users[altId];
        delete db.users[altId];
    } else if (altId && db.users[altId] && db.users[primaryId]) {
        const p = db.users[primaryId], a = db.users[altId];
        p.hit          = (p.hit || 0) + (a.hit || 0);
        p.banned        = Boolean(p.banned || a.banned);
        p.bannedReason  = p.bannedReason || a.bannedReason || '';
        p.warns         = Math.max(p.warns || 0, a.warns || 0);
        delete db.users[altId];
    }

    ensureUser(db, primaryId, m);
    if (jid) db.users[primaryId].jid = jid;
    if (lid) db.users[primaryId].lid = lid;

    if (isGroup) ensureGroup(db, from);
    global.db = db;

    let groupMetadata = null, participants = [], adminEntries = [], admins = [];
    if (isGroup) {
        groupMetadata = await getGroupMeta(sock, from);
        participants  = groupMetadata?.participants || [];
        adminEntries  = participants.filter(v => v.admin !== null);
        admins        = adminEntries.map(v => v.id);
    }

    const checkAccess = (list) => {
        const nums = (list || []).filter(Boolean).map(v => v.toString().replace(/\D/g, ''));
        return senderIds.some(sid => nums.some(n => n && sid.includes(n)));
    };

    const matchesAdmin = (p, ids) => ids.some(v => {
        const num = v.split('@')[0];
        return (p.id          && p.id.includes(num))
            || (p.lid         && p.lid.includes(num))
            || (p.phoneNumber && p.phoneNumber.includes(num));
    });
    const isOwner    = checkAccess([global.owner, botNumber]) || (global.ownerLid && senderIds.includes(global.ownerLid));
    const isAdmin    = isGroup ? adminEntries.some(p => matchesAdmin(p, senderIds)) : false;
    const isBotAdmin = isGroup ? adminEntries.some(p => matchesAdmin(p, [botNumber])) : false;

    logger.debug(`[owner-check] primaryId=${primaryId} lid=${lid} jid=${jid} senderIds=${JSON.stringify(senderIds)} global.owner=${global.owner} global.ownerLid=${global.ownerLid || '(belum resolve)'} → isOwner=${isOwner}`);

    if (db.users[primaryId]?.banned && !isOwner) {
        if (isCmd) {
            const lastNotice = banNoticeCooldown.get(primaryId) || 0;
            if (Date.now() - lastNotice > BAN_NOTICE_COOLDOWN) {
                banNoticeCooldown.set(primaryId, Date.now());
                await sock.sendMessage(from, { text: '🚫 Kamu dibanned dari bot ini.' });
            }
        }
        return;
    }
    if (isGroup && db.groups[from]?.mute && !isOwner && !isAdmin) return;
    if (db.settings?.maintenance && !isOwner)
        return sock.sendMessage(from, { text: '🔧 Bot sedang maintenance.' });

    const botMode = db.settings?.mode || 'public';
    if (botMode === 'private' && !isOwner) return;
    if (botMode === 'group' && !isGroup && !isOwner) return;

    if (isGroup && db.groups[from]?.antilink && isBotAdmin && !isOwner && !isAdmin) {
        if (/chat\.whatsapp\.com\/(?:invite\/)?[0-9A-Za-z]{20,24}/i.test(body)) {
            await sock.sendMessage(from, { text: `🚫 Link group terdeteksi. @${primaryId.split('@')[0]} dikeluarkan.`, mentions: [primaryId] });
            await sock.sendMessage(from, { delete: raw.key });
            await sock.groupParticipantsUpdate(from, [primaryId], 'remove');
            return;
        }
    }

    const mentionedJid = ctx?.mentionedJid || [];

    if (isGroup && db.groups[from]) {
        const grp = db.groups[from];

        if (grp.afk?.[primaryId] && !/^\S?afk(\s|$)/i.test(body.trim())) {
            const since = grp.afk[primaryId].since;
            delete grp.afk[primaryId];
            await sock.sendMessage(from, {
                text: `👋 @${primaryId.split('@')[0]} sudah kembali aktif! (AFK selama ${formatAfkDuration(Date.now() - since)})`,
                mentions: [primaryId],
            });
        }

        const afkTargets = new Set();
        for (const j of mentionedJid) {
            const num = j.split('@')[0].split(':')[0];
            const hit = Object.keys(grp.afk || {}).find(id => id.split('@')[0] === num);
            if (hit) afkTargets.add(hit);
        }
        if (m.quoted?.sender) {
            const num = m.quoted.sender.split('@')[0].split(':')[0];
            const hit = Object.keys(grp.afk || {}).find(id => id.split('@')[0] === num);
            if (hit) afkTargets.add(hit);
        }
        for (const target of afkTargets) {
            const info = grp.afk[target];
            await sock.sendMessage(from, {
                text: `💤 @${target.split('@')[0]} sedang AFK${info.reason ? `: ${info.reason}` : ''} (${formatAfkDuration(Date.now() - info.since)} yang lalu)`,
                mentions: [target],
            });
        }
    }

    const device = m.device || detectDevice(raw);

    const baseCtx = {
        body, raw, from,
        db:        db.users[primaryId],
        gdb:       db,
        isOwner, isAdmin, isBotAdmin, isGroup,
        isMentioned,
        participants, admins, groupMetadata,
        senderIds, primaryId, botNumber,
        mentionedJid, sendMess,
        pushname,
        saveDb,
        device,
    };

    if (body) {
        const sessionHandled = await routeSessionInput(sock, primaryId, body, { ...baseCtx, message: m });
        if (sessionHandled) {
            db.users[primaryId].hit = (db.users[primaryId].hit || 0) + 1;
            global.db = db;
            await saveDb();
            return;
        }
    }

    if (msg?.stickerMessage) {
        const stickerHash = Buffer.from(msg.stickerMessage.fileSha256 || []).toString('hex');
        const stickerCmd  = db.settings?.stickerCmds?.[stickerHash];

        if (stickerCmd && plugins.has(stickerCmd)) {
            const plugin = plugins.get(stickerCmd);
            const { meta, run } = plugin;

            if (meta?.interface?.isOwner && !isOwner) return sock.sendMessage(from, { text: '👑 Owner only.' });
            if (meta?.interface?.isAdmin && !isAdmin) return sock.sendMessage(from, { text: '👤 Group admin only.' });
            if (meta?.interface?.isGroup && !isGroup) return sock.sendMessage(from, { text: '👥 Group only.' });

            if (!isOwner) {
                const cdKey  = `${primaryId}:${stickerCmd}`;
                const cdTime = meta?.interface?.cooldown ?? 3;
                const since  = Date.now() - (cooldowns.get(cdKey) || 0);
                const sisa   = cdTime - Math.floor(since / 1000);
                if (sisa > 0) return sock.sendMessage(from, { text: `⏳ Tunggu ${sisa} detik lagi.` });
                cooldowns.set(cdKey, Date.now());
            }

            logger.cmd(primaryId, `[stiker] ${stickerCmd}`);
            global.db = db;

            try {
                await run(sock, { ...baseCtx, message: m, command: stickerCmd });
            } catch (e) {
                logger.error(`[STICKER-CMD] ${stickerCmd}: ${e.message}`);
                await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
            }

            db.users[primaryId].hit = (db.users[primaryId].hit || 0) + 1;
            global.db = db;
            await saveDb();
            return;
        }
    }

    if (isOwner && body.startsWith('$ ')) {
        try {
            const { stdout, stderr } = await execPromise(body.slice(2));
            return sock.sendMessage(from, { text: stdout || stderr || 'Done.' });
        } catch (err) {
            return sock.sendMessage(from, { text: err.message });
        }
    }
    if (isOwner && body.startsWith('>> ')) {
        try {
            let result = await eval(`(async () => { ${body.slice(3).includes('return') ? body.slice(3) : 'return ' + body.slice(3)} })()`);
            if (typeof result !== 'string') result = inspect(result);
            return sock.sendMessage(from, { text: result });
        } catch (err) {
            return sock.sendMessage(from, { text: String(err) });
        }
    }

    if (isCmd && plugins.has(command)) {
        const plugin = plugins.get(command);
        const { meta, run } = plugin;

        if (meta?.interface?.isOwner && !isOwner) return sock.sendMessage(from, { text: '👑 Owner only.' });
        if (meta?.interface?.isAdmin && !isAdmin) return sock.sendMessage(from, { text: '👤 Group admin only.' });
        if (meta?.interface?.isGroup && !isGroup) return sock.sendMessage(from, { text: '👥 Group only.' });

        if (!isOwner) {
            const cdKey  = `${primaryId}:${command}`;
            const cdTime = meta?.interface?.cooldown ?? 3;
            const since  = Date.now() - (cooldowns.get(cdKey) || 0);
            const sisa   = cdTime - Math.floor(since / 1000);
            if (sisa > 0) return sock.sendMessage(from, { text: `⏳ Tunggu ${sisa} detik lagi.` });
            cooldowns.set(cdKey, Date.now());
        }

        logger.cmd(primaryId, command);
        global.db = db;

        try {
            await run(sock, { ...baseCtx, message: m, command });
        } catch (e) {
            logger.error(`[CMD] ${command}: ${e.message}`);
            await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
        }

        db.users[primaryId].hit = (db.users[primaryId].hit || 0) + 1;
        global.db = db;
        await saveDb();
        return;
    }

    if (body) {
        logger.chat(primaryId, body, { isGroup, groupName: groupMetadata?.subject });
    }

    if (!isCmd || !isGroup) {
        const handled = await handleAI(sock, m, { ...baseCtx, m });
        if (handled) return;
    }
}

const captchaPending = new Map();
export const getCaptchaPending = () => captchaPending;

export async function participantsUpdate(sock, anu) {
    const { id, participants, action } = anu;

    bustGroupMetaCache(id);

    const db  = await import('./core/db.js').then(m => m.loadDb());
    const grp = db.groups?.[id];
    if (!grp?.welcome && !grp?.captcha) return;

    try {
        const metadata    = await sock.groupMetadata(id);
        const memberCount = metadata.participants?.length || 0;

        for (const jid of participants) {
            const userJid  = typeof jid === 'string' ? jid : (jid.id || String(jid));
            const phoneNum = userJid.split('@')[0].split(':')[0];

            if (action === 'add') {
                if (grp?.captcha) {
                    const n1 = Math.floor(Math.random() * 10) + 1;
                    const n2 = Math.floor(Math.random() * 10) + 1;
                    const answer = String(n1 + n2);
                    const timer  = setTimeout(async () => {
                        if (!captchaPending.has(userJid)) return;
                        captchaPending.delete(userJid);
                        try {
                            await sock.sendMessage(id, { text: `⏰ @${phoneNum} tidak jawab captcha. Dikeluarkan.`, mentions: [userJid] });
                            await sock.groupParticipantsUpdate(id, [userJid], 'remove');
                        } catch {}
                    }, 120000);
                    captchaPending.set(userJid, { answer, groupId: id, timer });
                    await sock.sendMessage(id, {
                        text: `🔐 Halo @${phoneNum}! Jawab dulu: berapa *${n1} + ${n2}*? (2 menit)`,
                        mentions: [userJid],
                    });
                }

                if (grp?.welcome) {
                    await sock.sendMessage(id, {
                        text: `👋 Selamat datang @${phoneNum}!\nKamu adalah member ke-${memberCount} di *${metadata.subject}*`,
                        mentions: [userJid],
                    });
                }

            } else if (action === 'remove') {
                const p = captchaPending.get(userJid);
                if (p?.timer) clearTimeout(p.timer);
                captchaPending.delete(userJid);

                if (grp?.welcome) {
                    if (grp.leftText) {
                        const text = grp.leftText
                            .replace(/@user/gi, `@${phoneNum}`)
                            .replace(/@group|@subject/gi, metadata.subject || 'group ini')
                            .replace(/@desc/gi, metadata.desc || '');
                        await sock.sendMessage(id, { text, mentions: [userJid] });
                    } else {
                        await sock.sendMessage(id, { text: `👋 Sampai jumpa @${phoneNum}!`, mentions: [userJid] });
                    }
                }
            }
        }
    } catch (e) {
        logger.error(`[participantsUpdate] ${e.message}`);
    }
}
