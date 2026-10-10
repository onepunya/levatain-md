

const BASE_URL = 'https://emojidb.org';

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#34;/g, '"');
}

function toSlug(query) {
    return query
        .trim()
        .toLowerCase()
        .replace(/-/g, '--')
        .replace(/\s+/g, '-');
}

export async function scrapeEmoji(query, opts = {}) {
    const { limit = 20, includeHidden = false } = opts;

    if (!query || !query.trim()) {
        throw new Error("Query kosong. Example: scrapeEmoji('kucing')");
    }

    const slug = toSlug(query);
    const url = `${BASE_URL}/${slug}-emojis`;

    const res = await fetch(url, {
        headers: {
            'user-agent':
                'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
            accept: 'text/html,application/xhtml+xml',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch emojidb.org (status ${res.status})`);
    }

    const html = await res.text();
    const ctnRegex =
        /<div class="emoji-ctn"\s*style="([^"]*)">\s*<div class="emoji"\s*>([\s\S]*?)<\/div>/g;

    const results = [];
    let match;
    while ((match = ctnRegex.exec(html)) !== null) {
        const styleAttr = match[1] || '';
        const isHidden = /display:\s*none/i.test(styleAttr);
        if (isHidden && !includeHidden) continue;

        const raw = match[2].trim();
        if (!raw) continue;

        results.push(decodeEntities(raw));

        if (results.length >= limit) break;
    }

    if (results.length === 0) {
        if (/No emojis found/i.test(html)) {
            return { query, url, results: [] };
        }
        throw new Error(
            'Tidak menemukan hasil — kemungkinan struktur HTML emojidb.org berubah.'
        );
    }

    return { query, url, results };
}

export default scrapeEmoji;
