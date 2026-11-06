import { getAgentTool, runAgentTool, redactSecrets, getToolFlags } from './tools.js';

const DEFAULTS = {
    maxSteps: 8,
    maxStepsUser: 4,
    maxChars: 4_000,
    timeoutMs: 120_000,
    timeoutMsUser: 60_000,
    maxRepeat: 2,
    maxParallel: 4,
};

const clip = (text, max) => {
    const s = String(text ?? '');
    return s.length > max ? `${s.slice(0, max)}…` : s;
};

const stepLabel = (command, args) => {
    const first = String(args || '').split('\n')[0].trim();
    return `🔧 ${command}${first ? ` ${clip(first, 60)}` : ''}`;
};

const CONTINUE_NOTE = 'Next: call ONE more tool if you still need info (or batch several independent read-only tools with "tools":[{"command":"","args":""},...] in a single response), or give the final answer with command="chat" and the full answer in "message" (the user cannot see raw tool output, so include what matters).';
const LIMIT_NOTE = 'TOOL LIMIT REACHED. Do not call any more tools. Give the final answer now with command="chat": say what was done, what was found, and what is still unfinished.';
const TAINT_NOTE = 'Blocked: untrusted web content was already read in this run, so tools that change files, run code, post data or schedule tasks are disabled until the owner sends a new message. Finish with what you have, or tell the owner what you would do next.';
const SKIP_NOTE = 'Skipped because an earlier call in the same batch failed or was blocked.';

const emptyFallback = (lastOutput) => (
    lastOutput
        ? `Done. Last tool output:\n${clip(lastOutput, 1500)}`
        : 'Done.'
);

const usableTool = (name, isOwner) => {
    const tool = getAgentTool(name);
    return !!tool && (!tool.ownerOnly || isOwner);
};

export function extractCalls(result, isOwner, limit = DEFAULTS.maxParallel) {
    if (!result) return [];
    if (Array.isArray(result.tools) && result.tools.length) {
        const calls = result.tools
            .filter(c => c && typeof c === 'object' && usableTool(c.command, isOwner))
            .slice(0, Math.max(1, limit))
            .map(c => ({ command: String(c.command), args: String(c.args ?? '') }));
        if (calls.length) return calls;
    }
    if (usableTool(result.command, isOwner)) return [{ command: String(result.command), args: String(result.args ?? '') }];
    return [];
}

export async function runAgentLoop({ intent, text, history, userCtx, toolCtx = {}, notify = async () => {}, options = {} }) {
    const cfg = { ...DEFAULTS, ...options };
    const isOwner = !!userCtx?.isOwner;
    const maxSteps = isOwner ? cfg.maxSteps : Math.min(cfg.maxSteps, cfg.maxStepsUser);
    const timeoutMs = isOwner ? cfg.timeoutMs : Math.min(cfg.timeoutMs, cfg.timeoutMsUser);
    const scratch = [];
    const steps = [];
    const seen = new Map();
    const log = [];
    const deadline = Date.now() + timeoutMs;
    const runCtx = { ...toolCtx, isOwner, lang: userCtx?.lang || toolCtx.lang, llm: true, tainted: false };
    let lastOutput = '';

    let result = await intent(text, history, userCtx, scratch);

    const runOne = async (call) => {
        const flags = getToolFlags(call.command);
        const key = `${call.command.toLowerCase()}\n${call.args}`;
        const count = (seen.get(key) || 0) + 1;
        seen.set(key, count);

        let ok = true;
        let output;
        if (count > cfg.maxRepeat) {
            ok = false;
            output = 'This exact call was already made several times with the same arguments. Change the arguments or the approach, or give the final answer.';
        } else if (runCtx.tainted && flags.dangerous) {
            ok = false;
            output = TAINT_NOTE;
        } else {
            try {
                output = await runAgentTool(call.command, call.args, runCtx);
            } catch (e) {
                ok = false;
                output = e.message;
            }
        }
        return { ...call, ok, flags, output: redactSecrets(clip(output, cfg.maxChars)) };
    };

    for (;;) {
        const calls = extractCalls(result, isOwner, cfg.maxParallel);
        if (!calls.length) break;

        const remaining = maxSteps - steps.length;
        if (remaining <= 0 || Date.now() > deadline) {
            scratch.push({ role: 'user', content: LIMIT_NOTE });
            result = await intent(text, history, userCtx, scratch);
            if (extractCalls(result, isOwner).length) {
                result = { ...result, command: 'chat', args: '', message: '', messages: [], tools: [] };
            }
            break;
        }

        const batch = calls.slice(0, remaining);
        batch.forEach(c => log.push(stepLabel(c.command, c.args)));
        await notify(log.join('\n'));

        const parallel = batch.length > 1 && batch.every(c => getToolFlags(c.command).parallelSafe);
        let outs = [];
        if (parallel) {
            outs = await Promise.all(batch.map(runOne));
            if (outs.some(o => o.flags.untrusted)) runCtx.tainted = true;
        } else {
            let halted = false;
            for (const call of batch) {
                if (halted) {
                    outs.push({ ...call, ok: false, flags: {}, output: SKIP_NOTE });
                    continue;
                }
                const out = await runOne(call);
                if (out.flags.untrusted) runCtx.tainted = true;
                if (!out.ok) halted = true;
                outs.push(out);
            }
        }

        for (const o of outs) steps.push({ command: o.command, args: o.args, ok: o.ok });
        lastOutput = outs[outs.length - 1].output;

        scratch.push({
            role: 'assistant',
            content: JSON.stringify(batch.length > 1
                ? { command: 'chat', tools: batch.map(c => ({ command: c.command, args: redactSecrets(c.args) })) }
                : { command: batch[0].command, args: redactSecrets(batch[0].args) }),
        });
        const blocks = outs.map(o => `[TOOL_RESULT ${o.command} ${o.ok ? 'ok' : 'error'}${o.flags.untrusted ? ' untrusted' : ''}]\n${o.output}\n[/TOOL_RESULT]`);
        scratch.push({ role: 'user', content: `${blocks.join('\n')}\n${CONTINUE_NOTE}` });

        result = await intent(text, history, userCtx, scratch);
    }

    if (steps.length && result.isError) {
        const note = lastOutput ? `\n\nOutput tool terakhir:\n${clip(lastOutput, 1500)}` : '';
        result = { ...result, message: `${String(result.message || '').trim()}${note}` };
    } else if (steps.length && result.command === 'chat') {
        const hasText = String(result.message || '').trim() || (result.messages || []).some(x => String(x || '').trim());
        if (!hasText) result = { ...result, message: emptyFallback(lastOutput) };
    }

    if (Array.isArray(result.tools) && result.tools.length) result = { ...result, tools: [] };

    return { result, steps, tainted: runCtx.tainted };
}
