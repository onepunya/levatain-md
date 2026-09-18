import { pick, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tembak', 'lamar', 'terima', 'tolak')
    .in('fun')
    .desc('Confess/propose to someone in a group; they can .accept or .reject')
    .showAllAliases()
    .groupOnly()
    .cooldown(10)
    .signal('User wants to confess feelings or propose to someone in a group', ['tembak @user', 'lamar @user aku suka kamu', 'terima', 'tolak'])
    .run(async (sock, { raw, from, command, message, mentionedJid, primaryId, pushname, botNumber, gdb  }) => {
        const nameOf = (jid, fallbackName) => gdb?.users?.[jid]?.name || fallbackName || `+${jid.split('@')[0]}`;

        if (command === 'terima' || command === 'tolak') {
            const key = `${from}:${primaryId}`;
            const entry = pending.get(key);
            if (!entry) {
                return sock.sendMessage(from, { text: '❓ Nobody is proposing to you here.' }, { quoted: raw });
            }

            clearTimeout(entry.timer);
            pending.delete(key);

            const accepted   = command === 'terima';
            const quote      = pick(accepted ? DITERIMA : DITOLAK);
            const targetName = nameOf(primaryId, pushname);
            const fromName   = nameOf(entry.fromId);

            return sock.sendMessage(from, {
                text: `${accepted ? '💌' : '💔'} *${targetName}* ${accepted ? 'accepted' : 'rejected'} proposal from *${fromName}*!\n\n_${quote}_`,
                mentions: [primaryId, entry.fromId],
            }, { quoted: raw });
        }

        const target = resolveTarget(message, mentionedJid);
        if (!target) {
            return sock.sendMessage(from, { text: msg('need.tag') }, { quoted: raw });
        }
        if (target.split('@')[0] === primaryId.split('@')[0]) {
            return sock.sendMessage(from, { text: msg('tembak.self') }, { quoted: raw });
        }
        if (botNumber && target.split('@')[0] === botNumber.split('@')[0]) {
            return sock.sendMessage(from, { text: msg('tembak.bot') }, { quoted: raw });
        }

        const key = `${from}:${target}`;
        if (pending.has(key)) {
            return sock.sendMessage(from, { text: msg('tembak.busy') }, { quoted: raw });
        }

        const targetName = nameOf(target);
        const fromName   = pushname || 'Someone';

        const timer = setTimeout(async () => {
            if (!pending.has(key)) return;
            pending.delete(key);
            try {
                await sock.sendMessage(from, {
                    text: msg('tembak.timeout', { target: targetName, from: fromName }),
                    mentions: [target, primaryId],
                });
            } catch {}
        }, TIMEOUT_MS);

        pending.set(key, { fromId: primaryId, timer });

        await sock.sendMessage(from, {
            text:
                `💘 *${fromName}* wants to confess to *${targetName}*!\n\n` +
                `_${pick(PEMBUKA)}_\n\n` +
                `*${targetName}*, reply within 5 minutes:\n` +
                `• *.terima* — if you feel the same\n` +
                `• *.tolak* — if you don't`,
            mentions: [target, primaryId],
        }, { quoted: raw });
    });

const pending = new Map();
const TIMEOUT_MS = 5 * 60_000;

const PEMBUKA = [
    'They say the greatest courage is not being unafraid of love, but speaking up even when you fear rejection.',
    'They say the greatest courage is speaking up even when you fear rejection.',
    'Love is like the wind — invisible, but you feel it. And now they want you to know.',
    'An honest heart does not need fancy words, only the courage to speak. And here it is.',
];

const DITERIMA = [
    'Two honest hearts finally met on the same path. Congratulations on this new chapter. 💞',
    'Some say the biggest regret is not trying at all.',
    'An honest heart does not need fancy words, only the courage to speak.',
];

const DITOLAK = [
    'Two honest hearts finally met on the same path. Congratulations. 💞',
    'Love that grows from honesty always finds a way to last.',
    'Sometimes all it takes is one brave moment and one yes.',
];

const TIDAK_DIJAWAB = [
    'Not every feeling must be returned — that is just a different path.',
    'Rejection does not mean you are worthless. Stay strong.',
    'Having the courage to speak is already a win. Keep going.',
];

function resolveTarget(message, mentionedJid) {
    if (message?.quoted) {
        const s = message.quoted.sender.replace(/@.*/, '').split(':')[0];
        return message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
    }
    if (mentionedJid?.[0]) return mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
    return null;
}

