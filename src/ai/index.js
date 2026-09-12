import { intentEngine } from './engine.js';
import { getHistory, addHistory, clearHistory, getUserMemory, setUserMemory, getAllUsersContext } from './memory.js';
import { shouldHandleAI, cleanTrigger, isOnCooldown } from './gate.js';
import { api } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { toVoiceNoteOpus } from '../lib/utils.js';
import { plugins } from '../core/loader.js';
import { getRandomMoodSticker } from '../lib/giphy.js';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

async function sendMoodSticker(sock, from, mood, raw) {
    try {
        const buffer = await getRandomMoodSticker(mood);
        if (!buffer) return;

        const sticker = new Sticker(buffer, {
            pack:    global.botName || 'Levatain',
            author:  'Levatain',
            type:    StickerTypes.FULL,
            quality: 70,
        });
        await sock.sendMessage(from, { sticker: await sticker.toBuffer() }, { quoted: raw });
    } catch (e) {
        logger.error(`[mood-sticker] ${e.message}`);
    }
}

export async function handleAI(sock, m, ctx) {
    const { body, raw, from, db, isOwner, isAdmin, primaryId, pushname, saveDb, isGroup, isMentioned } = ctx;

    const isQuotedFromBot = !!m.quoted?.fromMe;

    if (!shouldHandleAI(body, { isGroup, isMentioned, isQuotedFromBot })) return false;
    if (isOnCooldown(primaryId)) return false;

    const cleanText = cleanTrigger(body) || 'Halo!';

    const SONG_MEDIA_TYPES = { audioMessage: 'audio', videoMessage: 'video' };
    const ownMediaType = Object.keys(raw?.message || {})[0];
    const hasSongMedia = SONG_MEDIA_TYPES[m.quoted?.type] || SONG_MEDIA_TYPES[ownMediaType] || null;

    try {
        await sock.sendPresenceUpdate('composing', from);

        const history  = await getHistory(primaryId);
        const memory   = await getUserMemory(primaryId);
        const memoryStr = Object.keys(memory).length > 0
            ? Object.entries(memory).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

        const asksAboutOthers = /\b(siapa (dia|itu|si)|who is|cari user|data user|info user lain|user lain)\b/i.test(cleanText);
        const allUsersContext  = asksAboutOthers ? await getAllUsersContext(primaryId) : '';

        const result = await intentEngine(cleanText || body, history, {
            isOwner,
            pushname,
            memoryStr,
            allUsersContext,
            hasSongMedia,
        });

        const { command: aiCmd, args, message: aiMessage, remember, mood, voice: wantsVoice, preReply } = result;

        if (remember && typeof remember === 'object') {
            for (const [k, v] of Object.entries(remember))
                await setUserMemory(primaryId, k, v);
        }

        if (aiMessage) {
            if (wantsVoice) {
                if (preReply) {
                    await sock.sendMessage(from, { text: preReply }, { quoted: raw });
                }
                try {
                    await sock.sendPresenceUpdate('recording', from);
                    const mp3 = await api.generateVoiceNote(aiMessage);
                    const ogg = await toVoiceNoteOpus(mp3);
                    await sock.sendMessage(from, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: raw });
                } catch (e) {
                    logger.error(`[AI voice] ${e.message}`);
                    if (preReply) {
                        await sock.sendMessage(from, { text: '_⚠️ Voice note gagal dikirim, ini balasan teksnya:_\n\n' + aiMessage }, { quoted: raw });
                    } else {
                        await sock.sendMessage(from, { text: `${aiMessage}\n\n_⚠️ Voice note unavailable._` }, { quoted: raw });
                    }
                }
            } else {
                await sock.sendMessage(from, { text: aiMessage }, { quoted: raw });
            }
        }

        await addHistory(primaryId, 'user', cleanText || body);
        if (aiMessage) await addHistory(primaryId, 'assistant', aiMessage);

        if (aiCmd === 'reset_memory') {
            await clearHistory(primaryId);
            return true;
        }

        if (!aiCmd || aiCmd === 'chat') {

            if (mood) sendMoodSticker(sock, from, mood, raw);
            return true;
        }

        const plugin = plugins.get(aiCmd);
        if (!plugin) {
            logger.warn(`[AI] Command "${aiCmd}" not found`);
            return true;
        }

        if (plugin.meta?.interface?.isOwner && !isOwner) return true;
        if (plugin.meta?.interface?.isGroup && !isGroup) return true;
        if (plugin.meta?.interface?.isAdmin && !isAdmin) return true;

        logger.cmd(primaryId, `${aiCmd} [AI]`);
        await plugin.run(sock, {
            ...ctx,
            body: args ? `${aiCmd} ${args}` : aiCmd,
            message: m,
            command: aiCmd,
        });

        db.hit = (db.hit || 0) + 1;
        await saveDb();

    } catch (e) {
        logger.error(`[AI] ${e.message}`);
        await sock.sendMessage(from, { text: '⚠️ Terjadi error. Coba lagi!' }, { quoted: raw });
    }

    return true;
}
