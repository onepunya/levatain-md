const RUN_TIMEOUT_MS = 60_000;
const MAX_CAPTURE_CHARS = 3500;
const PURE_TEXT_KEYS = new Set(['text', 'mentions']);
const MEDIA_KEYS = ['image', 'video', 'audio', 'sticker', 'document', 'location', 'contacts', 'poll', 'buttons', 'interactiveMessage', 'sections', 'react', 'delete', 'forward', 'viewOnce'];
const BLOCKED_FOR_TOOL = new Set(['ai', 'tanya', 'reset_memory']);

async function loadDeps(ctx) {
    if (ctx._deps) return ctx._deps;
    const [{ plugins }, { denyReason }, { isTarget }, { checkAndConsume }, { makeSendHelpers }, { LIMIT_EXEMPT }] = await Promise.all([
        import('../core/loader.js'),
        import('../core/access.js'),
        import('../core/praiseGate.js'),
        import('../limits/limit.js'),
        import('../wa/reply.js'),
        import('../core/pipeline.js'),
    ]);
    return { plugins, denyReason, isTarget, checkAndConsume, makeSendHelpers, LIMIT_EXEMPT };
}

export function splitCommand(args) {
    const raw = String(args || '').trim().replace(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©<>:;\\/(){}[\]\-,]/, '');
    const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(raw);
    if (!m) return { command: '', rest: '' };
    return { command: m[1].toLowerCase(), rest: (m[2] || '').trim() };
}

function describeMedia(content) {
    const kind = MEDIA_KEYS.find(k => k in content) || Object.keys(content).find(k => k !== 'caption' && k !== 'mimetype') || 'message';
    const caption = typeof content.caption === 'string' ? content.caption.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    return `[sent directly to chat: ${kind}${caption ? ` — caption: "${caption}"` : ''}]`;
}

export function makeCaptureSock(sock, from) {
    const captured = [];
    const sentOther = [];
    const keyIndex = new Map();

    const sendMessage = async (jid, content = {}, opts) => {
        const keys = Object.keys(content || {});
        const isPureText = jid === from && typeof content.text === 'string' && keys.every(k => PURE_TEXT_KEYS.has(k) || k === 'edit');
        if (isPureText) {
            const editId = content.edit?.id;
            if (editId && keyIndex.has(editId)) {
                captured[keyIndex.get(editId)] = content.text;
                return { key: content.edit };
            }
            if (!content.edit) {
                const id = `captured-${captured.length + 1}`;
                keyIndex.set(id, captured.length);
                captured.push(content.text);
                return { key: { id, remoteJid: jid, fromMe: true }, message: { conversation: content.text } };
            }
        }
        const real = await sock.sendMessage(jid, content, opts);
        if (jid === from && !content.react && !content.delete && !content.edit) sentOther.push(describeMedia(content));
        return real;
    };

    const proxy = new Proxy(sock, {
        get(target, prop) {
            if (prop === 'sendMessage') return sendMessage;
            const v = Reflect.get(target, prop, target);
            return typeof v === 'function' ? v.bind(target) : v;
        },
    });
    return { proxy, captured, sentOther };
}

export async function runPluginTool(args, ctx = {}) {
    const base = ctx.pluginCtx;
    const sock = ctx.sock;
    if (!base || !sock) throw new Error('run_plugin is not available in this context (no chat session).');

    const { command, rest } = splitCommand(args);
    if (!command) throw new Error('Command required. Example: run_plugin balance');
    if (BLOCKED_FOR_TOOL.has(command)) throw new Error(`"${command}" cannot be run through run_plugin.`);

    const deps = await loadDeps(ctx);
    const plugin = deps.plugins.get(command);
    if (!plugin) throw new Error(`Unknown plugin command: ${command}`);

    const iface = plugin.meta?.interface || {};
    const { isOwner, isAdmin, isGroup, from, raw, primaryId } = base;

    const denied = deps.denyReason(iface, { isOwner, isAdmin, isGroup });
    if (denied) throw new Error(`Not allowed for this user (${denied}).`);
    if ((iface.isOwner || iface.isAdmin) && ctx.tainted) {
        throw new Error('Blocked: this run already read untrusted web content, so privileged commands are disabled. Ask the user to send the request again.');
    }
    if (!isOwner && deps.isTarget(base.senderIds || [])) {
        throw new Error('This command needs the user to confirm it directly. Tell them to send it as a normal command.');
    }

    const user = base.gdb?.users?.[primaryId] || base.db;
    if (!deps.LIMIT_EXEMPT.has(command) && user) {
        const result = await deps.checkAndConsume(user, command, isOwner);
        if (!result.ok) throw new Error('The user has no limit left for this feature.');
    }

    const { proxy, captured, sentOther } = makeCaptureSock(sock, from);
    const helpers = deps.makeSendHelpers(proxy, from, raw);
    const runCtx = {
        ...base,
        ...helpers,
        body: rest ? `${command} ${rest}` : command,
        message: base.m || base.message,
        command,
    };

    let timer;
    try {
        await Promise.race([
            plugin.run(proxy, runCtx),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Plugin ${command} timed out.`)), RUN_TIMEOUT_MS); }),
        ]);
    } finally {
        clearTimeout(timer);
    }

    if (user) user.hit = (user.hit || 0) + 1;
    if (typeof base.saveDb === 'function') await base.saveDb();

    const parts = [...captured.map(t => String(t).trim()).filter(Boolean), ...sentOther];
    const text = parts.join('\n---\n') || '(plugin finished without any text output)';
    return `🧩 ${command} result\n${text.length > MAX_CAPTURE_CHARS ? `${text.slice(0, MAX_CAPTURE_CHARS)}\n… (truncated)` : text}`;
}
