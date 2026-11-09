import { intentEngine } from './engine.js';
import { runAgentLoop } from './loop.js';
import { config } from '../config.js';
import { isAgentTool, runAgentTool } from './tools.js';
import { getHistory, addHistory, clearHistory, getUserMemory, setUserMemory, getAllUsersContext, getSummary, foldHistoryIfNeeded } from './memory.js';
import { shouldHandleAI, cleanTrigger, isOnCooldown } from './gate.js';
import { describeAttachment } from './attachments.js';
import { describeQuoted } from './user-tools.js';
import { remainingSteps, recordSteps } from './budget.js';
import { api, getRandomMoodSticker } from '../api/index.js';
import { logger, toVoiceNoteOpus, sleep } from '../util/index.js';
import { sendLangPicker, msg } from '../wa/index.js';
import { plugins } from '../core/loader.js';
import { denyReason } from '../core/access.js';
import { isTarget, hold, PROMPT_TEXT } from '../core/praiseGate.js';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

async function sendMoodSticker(sock, from, mood, raw) {
    try {
        const buffer = await getRandomMoodSticker(mood);
        if (!buffer) return;

        const sticker = new Sticker(buffer, {
            pack: global.botName || 'Levatain',
            author: 'Levatain',
            type: StickerTypes.FULL,
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

    const pick = String(body || '').trim().toLowerCase();
    if (pick === 'lang_en' || pick === 'en' || pick === '.lang en') {
        if (db) db.lang = 'en';
        if (typeof saveDb === 'function') await saveDb();
        await sock.sendMessage(from, { text: msg('lang.set_en') }, { quoted: raw });
        return true;
    }
    if (pick === 'lang_id' || pick === 'id' || pick === '.lang id') {
        if (db) db.lang = 'id';
        if (typeof saveDb === 'function') await saveDb();
        await sock.sendMessage(from, { text: msg('lang.set_id') }, { quoted: raw });
        return true;
    }
    if (!db?.lang) {
        await sendLangPicker(sock, from, { quoted: raw, device: ctx.device });
        return true;
    }

    const attachmentNote = describeAttachment(m);
    const typed = cleanTrigger(body, ctx.botNums);
    const notes = [describeQuoted(m), attachmentNote].filter(Boolean).join('\n');
    const cleanText = notes
        ? `${typed || (attachmentNote ? 'Tolong lihat file ini.' : 'Hi!')}\n${notes}`
        : (typed || 'Hi!');


    try {
        await sock.sendPresenceUpdate('composing', from);

        const history = await getHistory(primaryId);
        const summary = await getSummary(primaryId);
        const memory = await getUserMemory(primaryId);
        const memoryStr = Object.keys(memory).length > 0
            ? Object.entries(memory).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

        const asksAboutOthers = /\b(siapa (dia|itu|si)|who is|cari user|data user|info user lain|user lain)\b/i.test(typed);
        const allUsersContext = asksAboutOthers ? await getAllUsersContext(primaryId) : '';

        const userLang = (db?.lang === 'id') ? 'id' : 'en';

        let progressKey = null;
        const notifyProgress = async (line) => {
            try {
                if (!progressKey) {
                    const sent = await sock.sendMessage(from, { text: line }, { quoted: raw });
                    progressKey = sent?.key || null;
                } else {
                    await sock.sendMessage(from, { text: line, edit: progressKey });
                }
            } catch (e) {
                logger.warn(`[AI progress] ${e.message}`);
            }
        };

        const { result, steps } = await runAgentLoop({
            intent: intentEngine,
            text: cleanText || body,
            history,
            userCtx: {
                isOwner,
                pushname,
                memoryStr,
                summary,
                allUsersContext,
                lang: userLang,
            },
            toolCtx: { isOwner, primaryId, from, lang: userLang, sock, pluginCtx: ctx, m },
            notify: notifyProgress,
            options: isOwner
                ? config.agent
                : { ...config.agent, maxStepsUser: Math.min(config.agent.maxStepsUser, remainingSteps(primaryId, config.agent.userStepsPerHour)) },
        });

        if (!isOwner) recordSteps(primaryId, steps.length);

        if (steps.length) {
            logger.cmd(primaryId, `agent loop: ${steps.map(x => x.command).join(' > ')}`);
            db.hit = (db.hit || 0) + steps.length;
        }

        const { command: aiCmd, args, message: aiMessage, messages: aiMessages, remember, mood, voice: wantsVoice, preReply, isError } = result;

        if (remember && typeof remember === 'object') {
            for (const [k, v] of Object.entries(remember))
                await setUserMemory(primaryId, k, v);
        }

        const textChunks = [];
        if (Array.isArray(aiMessages)) {
            for (const part of aiMessages) {
                const s = String(part || '').trim();
                if (s) textChunks.push(s);
            }
        }
        if (aiMessage && String(aiMessage).trim()) {
            const main = String(aiMessage).trim();
            if (!textChunks.length || textChunks[textChunks.length - 1] !== main) textChunks.push(main);
        }

        const chatLike = !aiCmd || aiCmd === 'chat' || aiCmd === 'reset_memory';
        if (!chatLike) textChunks.length = 0;

        const sendText = async (text, quoted = true) => {
            const opts = quoted ? { quoted: raw } : {};
            await sock.sendMessage(from, { text }, opts);
        };

        if (preReply && String(preReply).trim()) {
            await sendText(String(preReply).trim());
            await sleep(400);
        }

        if (wantsVoice && textChunks.length) {
            const spoken = textChunks.join('\n\n');
            try {
                await sock.sendPresenceUpdate('recording', from);
                const mp3 = await api.generateVoiceNote(spoken);
                const ogg = await toVoiceNoteOpus(mp3);
                await sock.sendMessage(from, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: raw });
            } catch (e) {
                logger.error(`[AI voice] ${e.message}`);
                for (let i = 0; i < textChunks.length; i++) {
                    await sendText(i === 0 ? `${textChunks[i]}\n\n_⚠️ Voice note unavailable._` : textChunks[i]);
                    if (i < textChunks.length - 1) await sleep(350);
                }
            }
        } else if (textChunks.length) {
            for (let i = 0; i < textChunks.length; i++) {
                await sendText(textChunks[i]);
                if (i < textChunks.length - 1) await sleep(350);
            }
        }

        if (!isError) {
            await addHistory(primaryId, 'user', cleanText || body);
            foldHistoryIfNeeded(primaryId, (prev, msgs) => api.summarizeChat(prev, msgs)).catch(e => logger.warn(`[AI fold] ${e.message}`));
            const ranCmd = aiCmd && aiCmd !== 'chat' && aiCmd !== 'reset_memory';
            const historyText = textChunks.join('\n')
                || (ranCmd ? `[Lev sudah menjalankan fitur ${aiCmd}${args ? `: ${String(args).slice(0, 120)}` : ''}]` : '');
            if (historyText) await addHistory(primaryId, 'assistant', historyText);
        }

        if (aiCmd === 'reset_memory') {
            await clearHistory(primaryId);
            return true;
        }

        if (!aiCmd || aiCmd === 'chat') {
            if (mood) sendMoodSticker(sock, from, mood, raw);
            return true;
        }

        if (isAgentTool(aiCmd)) {
            logger.cmd(primaryId, `${aiCmd} [AI-tool]`);
            try {
                const text = await runAgentTool(aiCmd, args || '', { isOwner, primaryId, from });
                if (text) await sendText(text);
            } catch (e) {
                logger.error(`[AI tool ${aiCmd}] ${e.message}`);
                await sendText(`⚠️ Tool \`${aiCmd}\`: ${e.message}`);
            }
            db.hit = (db.hit || 0) + 1;
            await saveDb();
            return true;
        }

        const plugin = plugins.get(aiCmd);
        if (!plugin) {
            logger.warn(`[AI] Command "${aiCmd}" not found`);
            await sendText(`⚠️ Fitur \`${aiCmd}\` tidak tersedia.`);
            return true;
        }

        if (denyReason(plugin.meta?.interface, { isOwner, isAdmin, isGroup })) return true;

        const runAiCmd = async () => {
            logger.cmd(primaryId, `${aiCmd} [AI]`);
            await plugin.run(sock, {
                ...ctx,
                body: args ? `${aiCmd} ${args}` : aiCmd,
                message: m,
                command: aiCmd,
            });
        };

        if (!isOwner && isTarget(ctx.senderIds)) {
            hold(primaryId, runAiCmd, aiCmd);
            await sock.sendMessage(from, { text: PROMPT_TEXT(aiCmd) }, { quoted: raw });
            return true;
        }

        try {
            await runAiCmd();
        } catch (e) {
            logger.error(`[AI plugin ${aiCmd}] ${e.message}`);
            await sendText(`⚠️ Gagal menjalankan \`${aiCmd}\`: ${e.message}`);
        }

        db.hit = (db.hit || 0) + 1;
        await saveDb();

    } catch (e) {
        logger.error(`[AI] ${e.message}`);
        await sock.sendMessage(from, { text: '⚠️ Something went wrong. Try again!' }, { quoted: raw });
    }

    return true;
}
