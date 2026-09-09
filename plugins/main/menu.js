import { plugins } from '../../src/core/loader.js';

export const meta = {
    cmd:  ['menu', 'help', 'bantuan'],
    tag:  'main',
    aliasOnly: true,
    desc: 'Tampilkan daftar semua command',
    ai: {
        trigger: 'User minta daftar command, menu, atau bantuan bot',
        examples: ['menu', 'command apa aja', 'help'],
    },
};

const TAG_META = {
    ai:           { emoji: '🤖', label: 'AI & Asisten' },
    tools:        { emoji: '🛠️', label: 'Tools' },
    fun:          { emoji: '💌', label: 'Fun & Games' },
    audiochanger: { emoji: '🎚️', label: 'Audio Changer' },
    download:     { emoji: '📥', label: 'Download' },
    group:        { emoji: '👥', label: 'Group' },
    owner:        { emoji: '👑', label: 'Owner' },
    main:         { emoji: '⚙️', label: 'Main' },
    general:      { emoji: '📋', label: 'Lainnya' },
};

const KNOWN_TAG_ORDER = ['ai', 'tools', 'fun', 'audiochanger', 'download', 'group', 'owner', 'main', 'general'];

const resolveTagOrder = (usedTags) => {
    const known   = KNOWN_TAG_ORDER.filter(t => t !== 'general');
    const unknown = [...usedTags].filter(t => !KNOWN_TAG_ORDER.includes(t)).sort();
    return [...known, ...unknown, 'general'];
};

const labelize = (tag) => tag.charAt(0).toUpperCase() + tag.slice(1);

const READMORE = '\u200E'.repeat(4001);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJakartaHour = () => {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).find(p => p.type === 'hour').value;
    return parseInt(hourPart, 10) % 24;
};

const greeting = () => {
    const h = getJakartaHour();
    if (h >= 4 && h < 11)  return 'Selamat pagi';
    if (h >= 11 && h < 15) return 'Selamat siang';
    if (h >= 15 && h < 18) return 'Selamat sore';
    return 'Selamat malam';
};

const formatUptime = (sec) => {
    const hari  = Math.floor(sec / 86400);
    const jam   = Math.floor((sec % 86400) / 3600);
    const menit = Math.floor((sec % 3600) / 60);
    const detik = Math.floor(sec % 60);
    return [hari && `${hari}h`, jam && `${jam}j`, menit && `${menit}m`, `${detik}d`].filter(Boolean).join(' ');
};

const buildMenuText = (pushname, isOwner) => {
    const seenMeta = new Set();
    const grouped  = {};

    for (const [, plugin] of plugins) {
        const meta = plugin.meta;
        if (!meta || seenMeta.has(meta)) continue;
        seenMeta.add(meta);

        const tag = meta.tag || 'general';
        if (tag === 'owner' && !isOwner) continue;

        (grouped[tag] ??= []).push(meta);
    }

    const totalCmd = [...seenMeta].reduce((n, m) => n + (m.cmd?.length || 1), 0);

    let teaser  = `✦ *${global.botName}* ✦\n\n`;
    teaser     += `${greeting()}, *${pushname || 'kamu'}* 👋\n`;
    teaser     += `Command pakai *perintah*, atau ngobrol natural aja.`;

    let body = '';
    for (const tag of resolveTagOrder(Object.keys(grouped))) {
        const items = grouped[tag];
        if (!items?.length) continue;

        const { emoji, label } = TAG_META[tag] || { emoji: '📋', label: labelize(tag) };
        body += `┏───•❲ ${emoji} *${label}* ❳\n`;
        for (const meta of items.sort((a, b) => a.cmd[0].localeCompare(b.cmd[0]))) {
            const shown = meta.aliasOnly ? [meta.cmd[0]] : meta.cmd;
            for (const c of shown) {
                body += `│ • *.${c}*\n`;
            }
        }
        body += `┗────────────────··\n\n`;
    }

    body += `┏───•❲ 📊 *Info* ❳\n`;
    body += `│ • ${totalCmd} command tersedia\n`;
    body += `│ • Uptime ${formatUptime(process.uptime())}\n`;
    body += `┗────────────────··\n\n`;
    body += `_Ketik *.menu* kapan saja untuk lihat daftar ini lagi._`;

    return `${teaser}\n\n${READMORE}\n${body}`;
};

export async function run(sock, { raw, from, pushname, isOwner }) {
    const sent = await sock.sendMessage(from, { text: '⏳ Menyiapkan menu...' }, { quoted: raw });
    await sleep(800);

    const text = buildMenuText(pushname, isOwner);
    await sock.sendMessage(from, { text, edit: sent.key });
}
