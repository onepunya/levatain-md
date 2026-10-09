import { typing, api, msg, getArgs } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

function normalizeTarget(raw) {
    if (!raw) return null;
    const s = String(raw).split(':')[0];
    if (s.includes('@lid') || s.includes('@s.whatsapp.net')) return s;
    const digits = s.replace(/\D/g, '');
    if (!digits) return null;
    return `${digits}@s.whatsapp.net`;
}

function resolveTarget({ message, mentionedJid }) {
    if (message?.quoted?.sender) return normalizeTarget(message.quoted.sender);
    if (mentionedJid?.[0]) return normalizeTarget(mentionedJid[0]);
    return null;
}

function reasonFromBody(body) {
    let text = getArgs(body || '', 1) || '';
    text = text
        .replace(/@\d+/g, ' ')
        .replace(/\b(hard|soft|medium)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, 200);
}

function levelFromBody(body) {
    const t = String(body || '').toLowerCase();
    if (/\bhard\b/.test(t)) return 'hard';
    if (/\bsoft\b/.test(t)) return 'soft';
    return 'medium';
}

function findParticipant(participants, targetId) {
    if (!participants?.length || !targetId) return null;
    const num = targetId.replace(/\D/g, '');
    return participants.find((x) =>
        (x.id && x.id.replace(/\D/g, '') === num) ||
        (x.lid && String(x.lid).replace(/\D/g, '') === num) ||
        (x.phoneNumber && String(x.phoneNumber).replace(/\D/g, '') === num)
    ) || null;
}

function activityLabel(slot) {
    if (!slot || !slot.count) {
        return { level: 'unknown', summary: 'No tracked group messages yet (bot only counts after this feature was added).' };
    }
    const days = slot.lastAt ? Math.max(0, Math.floor((Date.now() - slot.lastAt) / 86400000)) : null;
    const tenureDays = slot.firstAt ? Math.max(0, Math.floor((Date.now() - slot.firstAt) / 86400000)) : null;
    const count = slot.count || 0;

    let level = 'low';
    if (count >= 80) level = 'high';
    else if (count >= 20) level = 'medium';

    const parts = [`~${count} tracked messages in this group`];
    if (tenureDays != null) parts.push(`first seen ~${tenureDays}d ago`);
    if (days != null) {
        if (days === 0) parts.push('last message today');
        else if (days === 1) parts.push('last message yesterday');
        else parts.push(`last message ~${days}d ago`);
    }
    if (level === 'low' && days != null && days >= 14) {
        parts.push('mostly silent / spectator vibe');
    }
    if (level === 'high') parts.push('often shows up in chat');
    return { level, summary: parts.join('; ') };
}

function memberTenureHint(slot, isGroup) {
    if (!isGroup) return null;
    if (!slot?.firstAt) return 'tenure unknown';
    const days = Math.floor((Date.now() - slot.firstAt) / 86400000);
    if (days <= 7) return `newish member (~${days}d tracked)`;
    if (days <= 60) return `been around ~${days} days`;
    return `long-time presence (~${Math.floor(days / 30)} months tracked)`;
}

async function collectWaProfile(sock, lookupId) {
    const out = {
        about: null,
        business: null,
        hasProfilePic: null,
        phoneVisible: lookupId?.includes('@s.whatsapp.net') || false,
    };

    if (!lookupId) return out;

    try {
        const status = await sock.fetchStatus(lookupId);
        const text = status?.status || status?.statusText || '';
        if (text && String(text).trim()) out.about = String(text).trim().slice(0, 180);
    } catch {}

    try {
        if (typeof sock.getBusinessProfile === 'function') {
            const biz = await sock.getBusinessProfile(lookupId);
            if (biz && (biz.description || biz.category || biz.email || biz.website || biz.address)) {
                out.business = {
                    description: biz.description ? String(biz.description).slice(0, 220) : null,
                    category: biz.category || biz.business_category || null,
                    email: biz.email || null,
                    website: biz.website || null,
                };
            }
        }
    } catch {}

    try {
        const url = await sock.profilePictureUrl(lookupId, 'image').catch(() => null);
        out.hasProfilePic = Boolean(url);
    } catch {
        out.hasProfilePic = false;
    }

    return out;
}

function buildMaterials({
    name,
    level,
    reason,
    roleLabel,
    activity,
    tenure,
    wa,
    userDb,
    isSelf,
}) {
    const lines = [];
    lines.push(`Display name: ${name}`);
    if (isSelf) lines.push('Note: they asked to roast themselves.');
    if (roleLabel) lines.push(`Group role: ${roleLabel}`);
    if (tenure) lines.push(`Membership signal: ${tenure}`);
    if (activity?.summary) lines.push(`Group activity: ${activity.summary}`);
    if (userDb?.hit) lines.push(`Bot command usage (global): ${userDb.hit} hits`);
    if (userDb?.lastChat) {
        const d = Math.floor((Date.now() - userDb.lastChat) / 86400000);
        lines.push(`Last bot interaction: ~${d}d ago`);
    }
    if (wa?.about) lines.push(`WhatsApp About/status: "${wa.about}"`);
    else lines.push('WhatsApp About/status: empty or hidden');
    if (wa?.business) {
        const b = wa.business;
        if (b.description) lines.push(`Business description: "${b.description}"`);
        if (b.category) lines.push(`Business category: ${b.category}`);
        if (b.website) lines.push(`Business website: ${b.website}`);
    } else {
        lines.push('Business profile: none / not available');
    }
    if (wa?.hasProfilePic === false) lines.push('Profile picture: default / none');
    else if (wa?.hasProfilePic === true) lines.push('Profile picture: set (do NOT body-shame)');
    if (wa?.phoneVisible) lines.push('Phone number: visible on WhatsApp JID');
    else lines.push('Phone number: hidden (LID / privacy)');
    if (reason) lines.push(`Extra roast angle from requester: ${reason}`);
    lines.push(`Intensity requested: ${level}`);
    return lines.join('\n');
}

function systemPrompt(level) {
    const intensity =
        level === 'hard'
            ? 'Mode hard: sarkasme lebih tajam dan nyelekit. Tetap larang hinaan suku/agama/disabilitas/orientasi, kekerasan seksual, dan ancaman nyata.'
            : level === 'soft'
              ? 'Mode soft: sindiran ringan, cerdas, tidak kejam.'
              : 'Mode medium: pedas, spesifik, gaya banter grup.';

    return [
        'Kamu penulis roast untuk grup WhatsApp.',
        'WAJIB menulis SELURUH isi roast dalam Bahasa Indonesia gaul/sehari-hari. Jangan campur kalimat penuh bahasa Inggris. Nama orang/merek boleh tetap seperti aslinya.',
        intensity,
        'Pakai HANYA data yang diberikan. Utamakan sindiran spesifik: status WA, bio bisnis, aktivitas (penonton vs aktif), member baru vs lama, nama, pemakaian bot.',
        'Struktur: 2–5 kalimat pendek. Observasi → dilebih-lebihkan → punchline.',
        'Jangan mengarang kejahatan, penipuan, atau klaim medis. Jangan puji di akhir. Tanpa hashtag. Tanpa pembuka seperti "Berikut roastnya".',
        'Kalau datanya tipis, fokus ke kebiasaan chat/penonton, tetap konkret.',
        'Output teks biasa saja, tanpa markdown berlebihan.',
    ].join(' ');
}

export default plugin('roast', 'roasting')
    .in('fun')
    .desc('Roast someone using WA profile + group activity signals (AI)')
    .prefixOnly()
    .cooldown(10)
    .signal('User wants to roast or insult someone for fun in the group', [
        'roast @user',
        'roasting dia',
        'roast hard @user read doang',
    ])
    .run(async (sock, {
        raw,
        from,
        body,
        message,
        mentionedJid,
        participants,
        isGroup,
        primaryId,
        gdb,
        pushname,
    }) => {
        const targetId = resolveTarget({ message, mentionedJid });
        if (!targetId) {
            return sock.sendMessage(from, {
                text: [
                    '🔥 *Roast*',
                    '',
                    'Tag or reply to someone:',
                    '• *.roast @user*',
                    '• *.roast hard @user*',
                    '• *.roast @user read doang, sok sibuk*',
                    '',
                    '_Uses WA about/business + group activity when available._',
                ].join('\n'),
            }, { quoted: raw });
        }

        const level = levelFromBody(body);
        const reason = reasonFromBody(body);
        const isSelf = targetId === primaryId || targetId.split('@')[0] === String(primaryId).split('@')[0];

        const p = findParticipant(participants, targetId);
        const lookupId = p?.phoneNumber
            || (targetId.includes('@s.whatsapp.net') ? targetId : null)
            || targetId;

        const userDb = gdb.users?.[targetId]
            || gdb.users?.[lookupId]
            || (p?.lid && gdb.users?.[p.lid])
            || {};

        const name = userDb.name
            || userDb.username
            || (isSelf ? pushname : null)
            || `User ${String(lookupId || targetId).split('@')[0].slice(-4)}`;

        const roleLabel = !isGroup ? null
            : p?.admin === 'superadmin' ? 'superadmin'
            : p?.admin === 'admin' ? 'admin'
            : 'member';

        const activityMap = isGroup ? (gdb.groups?.[from]?.activity || {}) : {};
        const slot = activityMap[targetId]
            || activityMap[lookupId]
            || (p?.lid && activityMap[p.lid])
            || null;
        const activity = activityLabel(slot);
        const tenure = memberTenureHint(slot, isGroup);

        await typing(sock, from);
        await sock.sendMessage(from, {
            text: '🔥 Gathering profile signals & cooking the roast...',
        }, { quoted: raw });

        let wa;
        try {
            wa = await collectWaProfile(sock, lookupId);
        } catch {
            wa = { about: null, business: null, hasProfilePic: null, phoneVisible: false };
        }

        const materials = buildMaterials({
            name,
            level,
            reason,
            roleLabel,
            activity,
            tenure,
            wa,
            userDb,
            isSelf,
        });

        try {
            const roastText = await api.chatAI(
                [{ role: 'user', content: `Buat roast orang ini. Tulis SEMUA kalimat roast dalam Bahasa Indonesia.\n\n${materials}` }],
                systemPrompt(level)
            );

            const text = String(roastText || '').trim();
            if (!text) throw new Error('Empty roast from AI');

            await sock.sendMessage(from, {
                text: `🔥 *Roast for ${name}*\n\n${text}`,
                mentions: [targetId],
            }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, {
                text: msg('fail.generic', { msg: e.message }),
            }, { quoted: raw });
        }
    });
