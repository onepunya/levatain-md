import { plugins } from '../core/loader.js';
import { formatUptime, pick } from '../util/utils.js';
import { registerSlots, pickText } from './menuText.js';

export const TAG_META = {
    ai:           { emoji: '🤖', label: 'AI & Assistant' },
    tools:        { emoji: '🛠️', label: 'Tools' },
    fun:          { emoji: '💌', label: 'Fun & Games' },
    audiochanger: { emoji: '🎚️', label: 'Audio Changer' },
    download:     { emoji: '📥', label: 'Download' },
    group:        { emoji: '👥', label: 'Group' },
    limit:        { emoji: '⚡', label: 'Limit & Plan' },
    owner:        { emoji: '👑', label: 'Owner' },
    main:         { emoji: '⚙️', label: 'Main' },
    general:      { emoji: '📋', label: 'Other' },
};

const dayDesc = (w) => `Short greeting/encouragement for ${w}, shown after "Good ${w.split(' ')[0]}, <name>". Do not include the user name.`;
registerSlots({
    greet_pagi:  { desc: dayDesc('morning (04-11)'),  max: 60 },
    greet_siang: { desc: dayDesc('afternoon (11-15)'), max: 60 },
    greet_sore:  { desc: dayDesc('evening (15-18)'),  max: 60 },
    greet_malam: { desc: dayDesc('night (18-04)'), max: 60 },
    teaser:      { desc: 'One short line inviting the user to type a command or chat with the bot.', max: 70 },
    hint_home:   { desc: 'Invite the user to open the category list below or type *.allmenu* (write exactly *.allmenu* with asterisks).', max: 90, must: /\*\.allmenu\*/ },
    hint_back:   { desc: 'Invite going back to the main menu with *.menu* or viewing all commands with *.allmenu* (write exactly with asterisks).', max: 90, must: s => /\*\.menu\*/.test(s) && /\*\.allmenu\*/.test(s) },
    hint_end:    { desc: 'Invite picking a category by typing *.menu* (write exactly with asterisks).', max: 70, must: /\*\.menu\*/ },
    ...Object.fromEntries(Object.entries(TAG_META).map(([tag, { label }]) => [
        `cat_${tag}`,
        { desc: `Short blurb for the "${label}" category in a WhatsApp bot (do not name the category).`, count: 5, max: 38 },
    ])),
});

export const backHint = () =>
    `_${pickText('hint_back', 'Type *.menu* to go back · *.allmenu* for all commands')}_`;

const KNOWN_TAG_ORDER = ['ai', 'download', 'tools', 'audiochanger', 'fun', 'group', 'limit', 'owner', 'main', 'general'];

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
        const meta = plugin.meta?.interface;
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

export function greeting() {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).find(p => p.type === 'hour').value;
    const h = parseInt(hourPart, 10) % 24;
    if (h >= 4 && h < 11)  return 'Good morning';
    if (h >= 11 && h < 15) return 'Good afternoon';
    if (h >= 15 && h < 18) return 'Good evening';
    return 'Good night';
}

const GREETING_PHRASES = {
    pagi:  ['Ready to start the day! ☀️', 'Let\'s make today count 💪', 'Don\'t skip breakfast 🍳'],
    siang: ['Remember to rest & grab lunch 🍽️', 'Hope your day is going well! ✨', 'Had lunch yet? 😄'],
    sore:  ['How\'s your day going so far? 🌇', 'Time for a short break ☕', 'Evening vibes, take it easy 😌'],
    malam: ['Time to wind down, but explore a bit first 🌙', 'Don\'t stay up too late 😴', 'A calm night to relax ✨'],
};

export function greetingPhrase() {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).find(p => p.type === 'hour').value;
    const h = parseInt(hourPart, 10) % 24;

    let key = 'malam';
    if (h >= 4 && h < 11)  key = 'pagi';
    else if (h >= 11 && h < 15) key = 'siang';
    else if (h >= 15 && h < 18) key = 'sore';

    const pool = GREETING_PHRASES[key];
    return pickText(`greet_${key}`, pick(pool));
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
    teaser     += `${greeting()}, *${pushname || 'there'}* 👋\n`;
    teaser     += `_${greetingPhrase()}_\n`;
    teaser     += pickText('teaser', 'Type a command, or just chat naturally.');

    let body = '';
    for (const tag of orderedTags) {
        body += `${buildCategoryText(tag, grouped[tag])}\n\n`;
    }

    body += `┏───•❲ 📊 *Info* ❳\n`;
    body += `│ • ${totalShown} commands available\n`;
    body += `│ • Uptime ${formatUptime(process.uptime())}\n`;
    body += `│ • Media limit *15MB* (upload & download)\n`;
    body += `│ • Usage limit reset every *3 hours*\n`;
    body += `│ • .limit · .register · .plan\n`;
    body += `┗────────────────··\n\n`;
    body += `_${pickText('hint_end', 'Type *.menu* to pick a category.')}_`;

    const READMORE = '\u200E'.repeat(4001);
    return `${teaser}\n\n${READMORE}\n${body}`;
}

export function buildHomeCaption(pushname, device, isOwner) {
    const { orderedTags, grouped, totalShown } = collectGrouped(isOwner);
    const isIos = device === 'ios';
    const hasNativeHeader = device === 'android';

    let text = hasNativeHeader ? '' : `✦ *${global.botName}* ✦\n`;
    text += `${greeting()}, *${pushname || 'there'}* 👋\n`;
    text += `_${greetingPhrase()}_\n\n`;
    text += `${totalShown} command\nmedia limit 15MB\nusage limit reset every 3h\n.limit · .register · .plan\n`;

    if (isIos) {
        text += `\n*Pick a category* (iPhone — type a number or command):\n\n`;
        orderedTags.forEach((tag, i) => {
            const { emoji, label } = TAG_META[tag] || { emoji: '📋', label: labelize(tag) };
            const n = grouped[tag].reduce((a, m) => a + shownCmds(m).length, 0);
            text += `${i + 1}. ${emoji} *${label}* (${n})\n`;
            text += `   type *.menu ${tag}*\n`;
        });
        text += `\n0. 📋 *All Menu* — type *.allmenu*`;
    } else {
        text += `\n${pickText('hint_home', 'Open the *Pick a category* list below, or type *.allmenu*.')}`;
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
            description: [`${n} command`, pickText(`cat_${tag}`, '')].filter(Boolean).join(' · '),
            id: `.menu ${tag}`,
        };
    });
    rows.push({
        header: '',
        title: 'All Menu',
        description: 'Show all commands',
        id: '.allmenu',
    });
    return [{ title: 'Category', rows }];
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
