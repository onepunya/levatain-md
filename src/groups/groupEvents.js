import { logger, randomInt } from '../util/index.js';
import { bustGroupMetaCache } from '../wa/index.js';
import { loadDb } from '../storage/db.js';

const CAPTCHA_TIMEOUT = 120_000;
const captchaPending  = new Map();

export const getCaptchaPending = () => captchaPending;

const phoneOf = (jid) => jid.split('@')[0].split(':')[0];

function startCaptcha(sock, groupId, userJid) {
    const a      = randomInt(1, 10);
    const b      = randomInt(1, 10);
    const number = phoneOf(userJid);

    const timer = setTimeout(async () => {
        if (!captchaPending.delete(userJid)) return;
        try {
            await sock.sendMessage(groupId, { text: `⏰ @${number} did not solve captcha. Removed.`, mentions: [userJid] });
            await sock.groupParticipantsUpdate(groupId, [userJid], 'remove');
        } catch {}
    }, CAPTCHA_TIMEOUT);

    captchaPending.set(userJid, { answer: String(a + b), groupId, timer });
    return sock.sendMessage(groupId, {
        text: `🔐 Halo @${number}! Solve this: what is *${a} + ${b}*? (2 minutes)`,
        mentions: [userJid]
    });
}

export function handleCaptchaAnswer(sock, m, body) {
    const jid     = m.key.participant || m.key.remoteJid;
    const pending = captchaPending.get(jid);
    if (!pending) return false;

    const passed = body.trim() === pending.answer;
    if (passed) {
        clearTimeout(pending.timer);
        captchaPending.delete(jid);
    }

    sock.sendMessage(pending.groupId, {
        text: passed ? `✅ @${jid.split('@')[0]} passed!` : `❌ @${jid.split('@')[0]} wrong, try again!`,
        mentions: [jid]
    });
    return true;
}

function renderLeftText(template, number, metadata) {
    return template
        .replace(/@user/gi, `@${number}`)
        .replace(/@group|@subject/gi, metadata.subject || 'group ini')
        .replace(/@desc/gi, metadata.desc || '');
}

export async function participantsUpdate(sock, { id, participants, action }) {
    bustGroupMetaCache(id);

    const db  = await loadDb();
    const grp = db.groups?.[id];
    if (!grp?.welcome && !grp?.captcha) return;

    try {
        const metadata    = await sock.groupMetadata(id);
        const memberCount = metadata.participants?.length || 0;

        for (const entry of participants) {
            const userJid = typeof entry === 'string' ? entry : (entry.id || String(entry));
            const number  = phoneOf(userJid);

            if (action === 'add') {
                if (grp.captcha) await startCaptcha(sock, id, userJid);
                if (grp.welcome) {
                    await sock.sendMessage(id, {
                        text: `👋 Welcome @${number}!\nYou are member #${memberCount} in *${metadata.subject}*`,
                        mentions: [userJid]
                    });
                }
            } else if (action === 'remove') {
                const pending = captchaPending.get(userJid);
                if (pending?.timer) clearTimeout(pending.timer);
                captchaPending.delete(userJid);

                if (grp.welcome) {
                    const text = grp.leftText
                        ? renderLeftText(grp.leftText, number, metadata)
                        : `👋 Goodbye @${number}!`;
                    await sock.sendMessage(id, { text, mentions: [userJid] });
                }
            }
        }
    } catch (e) {
        logger.error(`[participantsUpdate] ${e.message}`);
    }
}
