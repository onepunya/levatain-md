import { typing, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';
import { saveDb } from '../../src/core/db.js';

const MAX_TAKEN_IN_PROMPT = 80;
const MAX_RETRY = 2;

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Cursed', 'Chaotic'];

function ensureRegistry(gdb) {
    if (!gdb.khodamTaken || typeof gdb.khodamTaken !== 'object') {
        gdb.khodamTaken = {};
    }
    return gdb.khodamTaken;
}

function takenNames(registry) {
    return Object.keys(registry || {});
}

function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function formatKhodam(ownerLabel, data, isOwner = true) {
    const abilities = Array.isArray(data.abilities)
        ? data.abilities.map((a) => `• ${a}`).join('\n')
        : `• ${data.abilities || '-'}`;

    const who = isOwner ? 'Your' : `*${ownerLabel}*'s`;
    return [
        `🔮 *Khodam Check*`,
        ``,
        `👤 ${who} khodam: ${data.emoji || '✨'} *${data.name}*`,
        `🏅 Rarity: *${data.rarity || 'Mysterious'}*`,
        ``,
        `📖 *Lore*`,
        data.lore || '-',
        ``,
        `⚔️ *Abilities*`,
        abilities,
        ``,
        `🧠 *Personality*`,
        data.personality || '-',
        ``,
        `_Assigned · ${data.assignedAt ? new Date(data.assignedAt).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }) : 'just now'}_`,
    ].join('\n');
}

function parseJson(text) {
    if (!text) return null;
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
        return JSON.parse(text.slice(a, b + 1));
    } catch {
        return null;
    }
}

function validatePayload(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const name = String(obj.name || '').trim();
    if (name.length < 3 || name.length > 80) return null;
    const abilities = Array.isArray(obj.abilities)
        ? obj.abilities.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
        : [];
    if (!abilities.length) return null;
    let rarity = String(obj.rarity || 'Rare').trim();
    if (!RARITIES.some((r) => r.toLowerCase() === rarity.toLowerCase())) {
        rarity = 'Chaotic';
    } else {
        rarity = RARITIES.find((r) => r.toLowerCase() === rarity.toLowerCase());
    }
    return {
        name,
        emoji: String(obj.emoji || '👻').trim().slice(0, 8) || '👻',
        rarity,
        lore: String(obj.lore || '').trim().slice(0, 400) || 'A being beyond mortal comprehension.',
        abilities,
        personality: String(obj.personality || '').trim().slice(0, 220) || 'Unstable and unpredictable.',
    };
}

async function generateUniqueKhodam(taken) {
    const exclude = taken.slice(0, MAX_TAKEN_IN_PROMPT);
    const excludeBlock = exclude.length
        ? `These names are ALREADY TAKEN — never reuse or lightly paraphrase them:\n${exclude.map((n) => `- ${n}`).join('\n')}`
        : 'No names taken yet.';

    const system = [
    'Ciptakan pendamping spiritual yang ABSURD bernama "khodam" untuk bot WhatsApp komedi.', 'Gaya: kacau, ala meme, humor surealis. Campurkan objek sehari-hari, hewan, pekerjaan, budaya internet, makanan, dan mitologi.', 'Nama harus unik, mencolok, dan konyol (3–8 kata). Contoh nuansa (JANGAN ditiru): "Helmet Ojek Online Berjiwa Poet", "Tuyul Gen Z Stockbit Trader", "Kucing Oren Rank Mythic".', 'Balas HANYA dengan JSON yang valid, tanpa markdown, tanpa blok kode:', '{"name":"...","emoji":"satu emoji","rarity":"Common|Uncommon|Rare|Epic|Legendary|Mythic|Cursed|Chaotic","lore":"2-3 kalimat pendek","abilities":["...","...","..."],"personality":"1-2 kalimat pendek"}', 'Kemampuan harus lucu namun spesifik (apa dampaknya bagi pemilik). Lore menjelaskan asal-usul. Teks bahasa Inggris lebih disukai; nama boleh mencampur bahasa demi unsur komedi',
    ].join(' ');

    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        const extra =
            attempt === 0
                ? ''
                : ` CRITICAL: previous name collided or was invalid. Invent something COMPLETELY different and weirder.`;

        const user = [
            `Invent one brand-new khodam.${extra}`,
            excludeBlock,
            'Return JSON only.',
        ].join('\n');

        const raw = await api.chatAI([{ role: 'user', content: user }], system);
        const parsed = validatePayload(parseJson(raw));
        if (!parsed) {
            lastErr = new Error('LLM returned invalid khodam JSON');
            continue;
        }
        const key = normalizeName(parsed.name);
        if (taken.includes(key) || exclude.map(normalizeName).includes(key)) {
            lastErr = new Error('Khodam name already taken');
            taken.push(key);
            continue;
        }
        return parsed;
    }
    throw lastErr || new Error('Failed to generate a unique khodam');
}

function resolveTargetId(message, mentionedJid, primaryId) {
    const m = mentionedJid?.[0];
    if (m) return m.includes('@') ? m.split(':')[0] : `${String(m).split(':')[0]}@s.whatsapp.net`;
    const ctx = message?.extendedTextMessage?.contextInfo;
    const part = ctx?.participant;
    if (part) return part.split(':')[0];
    return primaryId;
}

export default plugin('cekhodam', 'khodam', 'mykhodam')
    .in('fun')
    .desc('Check your absurd spiritual khodam (unique per user, saved forever)')
    .prefixOnly()
    .cooldown(8)
    .signal('User wants to check their khodam or spiritual companion', [
        'cek khodam saya',
        'cekhodam',
        'what is my khodam',
        'my khodam',
    ])
    .run(async (sock, {
        raw,
        from,
        primaryId,
        gdb,
        pushname,
        message,
        mentionedJid,
    }) => {
        const targetId = resolveTargetId(message, mentionedJid, primaryId);
        const isSelf = targetId === primaryId || targetId?.split('@')[0] === primaryId?.split('@')[0];

        const targetUser = gdb.users?.[targetId] || (isSelf ? gdb.users[primaryId] : null);
        if (!targetUser) {
            return sock.sendMessage(from, {
                text: '❌ User not found in bot data. They need to interact with the bot first.',
            }, { quoted: raw });
        }

        const ownerLabel = targetUser.name || targetUser.username || pushname || 'User';


        if (targetUser.khodam?.name) {
            return sock.sendMessage(from, {
                text: formatKhodam(ownerLabel, targetUser.khodam, isSelf),
                mentions: isSelf ? [] : [targetId],
            }, { quoted: raw });
        }

       
        if (!isSelf) {
            return sock.sendMessage(from, {
                text: `❌ *${ownerLabel}* has no khodam yet.\nThey must run *.cekhodam* themselves to summon one.`,
                mentions: [targetId],
            }, { quoted: raw });
        }

        await typing(sock, from);
        await sock.sendMessage(from, {
            text: '🔮 Consulting the chaos realm for your khodam...',
        }, { quoted: raw });

        try {
            const registry = ensureRegistry(gdb);
            const taken = takenNames(registry);

            const generated = await generateUniqueKhodam(taken);
            const key = normalizeName(generated.name);

            
            if (registry[key]) {
                throw new Error('Khodam name was claimed just now. Try again.');
            }

            const record = {
                ...generated,
                assignedAt: Date.now(),
            };

            targetUser.khodam = record;
            registry[key] = primaryId;
            await saveDb();

            await sock.sendMessage(from, {
                text: formatKhodam(ownerLabel, record, true),
            }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, {
                text: msg('fail.generic', { msg: e.message }),
            }, { quoted: raw });
        }
    });
