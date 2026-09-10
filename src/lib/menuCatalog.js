import { plugins } from '../core/loader.js';

export const TAG_META = {
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

const KNOWN_TAG_ORDER = ['ai', 'download', 'tools', 'audiochanger', 'fun', 'group', 'owner', 'main', 'general'];

export function uniqueCmds(cmds = []) {
    const list = Array.isArray(cmds) ? cmds : [cmds];
    const seen = new Set();
    const out = [];
    for (const c of list) {
        const v = String(c || '').toLowerCase().trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}

export function longestCmd(cmds = []) {
    const list = uniqueCmds(cmds);
    return [...list].sort((a, b) => b.length - a.length || a.localeCompare(b))[0] || '';
}

export function shownCmds(meta) {
    const list = uniqueCmds(meta?.cmd);
    if (!list.length) return [];
    if (meta?.aliasOnly !== false) return [longestCmd(list)];
    return [...list].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function labelize(tag) {
    return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function resolveTagOrder(usedTags) {
    const known = KNOWN_TAG_ORDER.filter(t => t !== 'general');
    const unknown = [...usedTags].filter(t => !KNOWN_TAG_ORDER.includes(t)).sort();
    return [...known, ...unknown, 'general'];
}

export function collectGrouped(isOwner) {
    const seenMeta = new Set();
    const grouped = {};

    for (const [, plugin] of plugins) {
        const meta = plugin.meta;
        if (!meta || seenMeta.has(meta)) continue;
        seenMeta.add(meta);

        const tag = meta.tag || 'general';
        if (tag === 'owner' && !isOwner) continue;
        (grouped[tag] ??= []).push(meta);
    }

    for (const tag of Object.keys(grouped)) {
        grouped[tag].sort((a, b) => longestCmd(a.cmd).localeCompare(longestCmd(b.cmd)));
    }

    const orderedTags = resolveTagOrder(Object.keys(grouped)).filter(t => grouped[t]?.length);
    const totalShown = [...seenMeta].reduce((n, m) => {
        if (m.tag === 'owner' && !isOwner) return n;
        return n + shownCmds(m).length;
    }, 0);

    return { grouped, orderedTags, totalShown };
}

export function formatUptime(sec) {
    const hari  = Math.floor(sec / 86400);
    const jam   = Math.floor((sec % 86400) / 3600);
    const menit = Math.floor((sec % 3600) / 60);
    const detik = Math.floor(sec % 60);
    return [hari && `${hari}h`, jam && `${jam}j`, menit && `${menit}m`, `${detik}d`].filter(Boolean).join(' ');
}

export function greeting() {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).find(p => p.type === 'hour').value;
    const h = parseInt(hourPart, 10) % 24;
    if (h >= 4 && h < 11)  return 'Selamat pagi';
    if (h >= 11 && h < 15) return 'Selamat siang';
    if (h >= 15 && h < 18) return 'Selamat sore';
    return 'Selamat malam';
}

export function buildCategoryText(tag, items) {
    const { emoji, label } = TAG_META[tag] || { emoji: '📋', label: labelize(tag) };
    let body = `┏───•❲ ${emoji} *${label}* ❳\n`;
    for (const meta of items) {
        for (const c of shownCmds(meta)) {
            body += `│ • *.${c}*\n`;
        }
    }
    body += `┗────────────────··`;
    return body;
}

export function buildAllMenuText(pushname, isOwner) {
    const { grouped, orderedTags, totalShown } = collectGrouped(isOwner);
    let teaser  = `✦ *${global.botName}* ✦\n\n`;
    teaser     += `${greeting()}, *${pushname || 'kamu'}* 👋\n`;
    teaser     += `Ketik perintah, atau ngobrol natural aja.`;

    let body = '';
    for (const tag of orderedTags) {
        body += `${buildCategoryText(tag, grouped[tag])}\n\n`;
    }

    body += `┏───•❲ 📊 *Info* ❳\n`;
    body += `│ • ${totalShown} command tersedia\n`;
    body += `│ • Uptime ${formatUptime(process.uptime())}\n`;
    body += `│ • Limit media *15MB* (upload & download)\n`;
    body += `┗────────────────··\n\n`;
    body += `_Ketik *.menu* untuk pilih kategori._`;

    const READMORE = '\u200E'.repeat(4001);
    return `${teaser}\n\n${READMORE}\n${body}`;
}

export function buildHomeCaption(pushname, device, isOwner) {
    const { orderedTags, grouped, totalShown } = collectGrouped(isOwner);
    const isIos = device === 'ios';

    let text = `✦ *${global.botName}* ✦\n`;
    text += `${greeting()}, *${pushname || 'kamu'}* 👋\n\n`;
    text += `${totalShown} command · limit media 15MB\n`;

    if (isIos) {
        text += `\n*Pilih kategori* (iPhone — ketik nomor atau perintah):\n\n`;
        orderedTags.forEach((tag, i) => {
            const { emoji, label } = TAG_META[tag] || { emoji: '📋', label: labelize(tag) };
            const n = grouped[tag].reduce((a, m) => a + shownCmds(m).length, 0);
            text += `${i + 1}. ${emoji} *${label}* (${n})\n`;
            text += `   ketik *.menu ${tag}*\n`;
        });
        text += `\n0. 📋 *All Menu* — ketik *.allmenu*`;
    } else {
        text += `\nBuka list *Pilih kategori* di bawah, atau ketik *.allmenu*.`;
    }

    return text;
}

export function buildListSections(isOwner) {
    const { orderedTags, grouped } = collectGrouped(isOwner);
    const rows = orderedTags.map(tag => {
        const { emoji, label } = TAG_META[tag] || { emoji: '📋', label: labelize(tag) };
        const n = grouped[tag].reduce((a, m) => a + shownCmds(m).length, 0);
        return {
            header: '',
            title: `${emoji} ${label}`,
            description: `${n} command`,
            id: `.menu ${tag}`,
        };
    });
    rows.push({
        header: '',
        title: 'All Menu',
        description: 'Tampilkan semua command',
        id: '.allmenu',
    });
    return [{ title: 'Kategori', rows }];
}

export function resolveMenuArg(arg, isOwner) {
    const a = String(arg || '').toLowerCase().trim();
    if (!a) return { type: 'home' };
    if (a === 'all' || a === 'allmenu' || a === '0') return { type: 'all' };

    const { orderedTags } = collectGrouped(isOwner);
    if (/^\d+$/.test(a)) {
        const n = parseInt(a, 10);
        const tag = orderedTags[n - 1];
        if (tag) return { type: 'tag', tag };
        return { type: 'home' };
    }

    if (orderedTags.includes(a) || TAG_META[a]) return { type: 'tag', tag: a };

    const byLabel = orderedTags.find(t => {
        const lab = (TAG_META[t]?.label || t).toLowerCase();
        return lab === a || lab.includes(a) || t.includes(a);
    });
    if (byLabel) return { type: 'tag', tag: byLabel };

    return { type: 'home' };
}
