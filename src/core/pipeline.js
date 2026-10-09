import { logger, msg, checkAndConsume, buildLimitCard } from '../lib/index.js';
import { saveDb } from './db.js';
import { denyReason } from './access.js';
import { isTarget, hold, PROMPT_TEXT } from './praiseGate.js';

const cooldowns = new Map();
const DEFAULT_COOLDOWN = 3;

const LIMIT_EXEMPT = new Set([
    'limit', 'ceklimit', 'register', 'daftar', 'plan', 'beli', 'harga',
    'setplan', 'addlimit', 'menu', 'allmenu', 'ping', 'infobot', 'lang', 'sc'
]);

function cooldownLeft(primaryId, command, iface) {
    const key   = `${primaryId}:${command}`;
    const limit = iface?.cooldown ?? DEFAULT_COOLDOWN;
    const left  = limit - Math.floor((Date.now() - (cooldowns.get(key) || 0)) / 1000);
    if (left > 0) return left;
    cooldowns.set(key, Date.now());
    return 0;
}

function limitText(result, user, pushname) {
    const card = buildLimitCard(result.info, user.name || pushname);
    return `🚫 *Limit exhausted!*\n\n${card}\n\n💡 Type *.plan* to upgrade or wait for reset.`;
}

export async function executeCommand(sock, {
    plugin,
    command,
    label = command,
    m,
    baseCtx,
    db,
    primaryId,
    pushname,
    skipGate = false
}) {
    const { from, raw, isOwner, isAdmin, isGroup } = baseCtx;
    const iface  = plugin.meta?.interface;
    const user   = db.users[primaryId];
    const reply  = (content, quoted) => sock.sendMessage(from, content, quoted ? { quoted: raw } : undefined);

    if (!skipGate && !isOwner && isTarget(baseCtx.senderIds)) {
        hold(primaryId, () => executeCommand(sock, {
            plugin, command, label, m, baseCtx, db, primaryId, pushname, skipGate: true
        }), command);
        return reply({ text: PROMPT_TEXT(command) }, true);
    }

    const denied = denyReason(iface, { isOwner, isAdmin, isGroup });
    if (denied) return reply({ text: msg(denied) });

    if (!isOwner) {
        const left = cooldownLeft(primaryId, command, iface);
        if (left) return reply({ text: msg('sys.cooldown', { sec: left }) });
    }

    if (!LIMIT_EXEMPT.has(command)) {
        const result = await checkAndConsume(user, command, isOwner);
        if (!result.ok) return reply({ text: limitText(result, user, pushname) }, true);
    }

    logger.cmd(primaryId, label);
    global.db = db;

    try {
        await plugin.run(sock, { ...baseCtx, message: m, command });
    } catch (e) {
        logger.error(`[CMD] ${command}: ${e.message}`);
        await reply({ text: msg('fail.generic', { msg: e.message }) });
    }

    user.hit = (user.hit || 0) + 1;
    await saveDb();
}
