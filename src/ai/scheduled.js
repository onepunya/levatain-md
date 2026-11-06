import { runAgentLoop } from './loop.js';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

export async function runScheduledTask(item, deps = {}) {
    const lang = item.lang === 'en' ? 'en' : 'id';
    const userCtx = { isOwner: !!item.isOwner, pushname: 'Owner', memoryStr: '', summary: '', lang };
    const text = `[SCHEDULED TASK #${item.id}] Nobody is chatting right now; do this task fully on your own and give the final result in "message": ${item.text}`;

    let run;
    try {
        const intent = deps.intent || (await import('./engine.js')).intentEngine;
        run = await runAgentLoop({
            intent,
            text,
            history: [],
            userCtx,
            toolCtx: { primaryId: item.owner, from: item.chat, sock: global.sock, scheduled: true, lang },
            options: config.agent,
        });
    } catch (e) {
        logger.error(`[scheduled task #${item.id}] ${e.message}`);
        return lang === 'id' ? `⚠️ Tugas gagal dijalankan: ${e.message}` : `⚠️ Task failed: ${e.message}`;
    }

    const { result, steps } = run;
    const parts = [...(result.messages || []), result.message].map(x => String(x || '').trim()).filter(Boolean);
    let out = parts.join('\n\n');
    if (result.command && result.command !== 'chat') {
        const note = lang === 'id'
            ? `(Tugas meminta fitur \`${result.command}\` yang tidak bisa dijalankan tanpa pengawasan.)`
            : `(The task asked for \`${result.command}\`, which cannot run unattended.)`;
        out = out ? `${out}\n\n${note}` : note;
    }
    if (!out) out = lang === 'id' ? 'Selesai, tetapi tidak ada hasil teks.' : 'Finished, but there was no text result.';
    if (steps.length) out += `\n\n_🔧 ${steps.map(s => s.command).join(' → ')}_`;
    return out;
}
