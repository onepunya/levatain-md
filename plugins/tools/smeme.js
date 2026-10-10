import sharp from 'sharp';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { typing, downloadMedia, getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function wrapText(text, maxCharsPerLine) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (test.length > maxCharsPerLine && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

function buildTextBlock(text, width, fontSize, baseY, anchor) {
    const maxChars = Math.max(6, Math.floor(width / (fontSize * 0.6)));
    const lines = wrapText(text.toUpperCase(), maxChars);
    const lineHeight = fontSize * 1.15;

    return lines.map((line, i) => {
        const y = anchor === 'top'
            ? baseY + i * lineHeight
            : baseY - (lines.length - 1 - i) * lineHeight;

        return `<text x="50%" y="${y}" font-family="Impact, Arial Black, sans-serif" font-size="${fontSize}" font-weight="900" fill="white" stroke="black" stroke-width="${fontSize * 0.06}" stroke-linejoin="round" paint-order="stroke" text-anchor="middle">${escapeXml(line)}</text>`;
    }).join('');
}

export default plugin('smeme')
    .in('tools')
    .desc('Make a meme sticker with your own top/bottom text')
    .prefixOnly()
    .signal('User asks to make a meme sticker with custom top/bottom text on an image or sticker', [
        'smeme welcome | guys',
        'smeme guys',
        'smeme | guys',
    ])
    .run(async (sock, {
        body,
        message,
        raw,
        from,
        pushname
    }) => {
        const args = getArgs(body);
        if (!args) {
            return sock.sendMessage(from, {
                text:
                    `❌ Provide the meme text.\n\n` +
                    `Format:\n` +
                    `*.smeme atas | bawah*\n` +
                    `*.smeme bawah saja*\n` +
                    `*.smeme | bawah saja*`,
            }, { quoted: raw });
        }

        const parts = args.split('|');
        const top = parts.length >= 2 ? parts[0].trim() : '';
        const bottom = parts.length >= 2 ? parts.slice(1).join('|').trim() : parts[0].trim();

        if (!top && !bottom) {
            return sock.sendMessage(from, { text: msg('need.text') }, { quoted: raw });
        }

        const result = await downloadMedia(raw, message.quoted, ['image', 'sticker']);
        if (!result) {
            return sock.sendMessage(from, {
                text: '❌ Send or reply to an image/sticker first.',
            }, { quoted: raw });
        }

        await typing(sock, from);
        try {
            const base = sharp(result.buffer).ensureAlpha();
            const meta = await base.metadata();
            const width = meta.width || 512;
            const height = meta.height || 512;
            const fontSize = Math.round(width * 0.11);

            let svgParts = '';
            if (top) svgParts += buildTextBlock(top, width, fontSize, fontSize * 1.1, 'top');
            if (bottom) svgParts += buildTextBlock(bottom, width, fontSize, height - fontSize * 0.4, 'bottom');

            const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgParts}</svg>`);

            const composed = await base
                .composite([{ input: overlay, top: 0, left: 0 }])
                .png()
                .toBuffer();

            const sticker = new Sticker(composed, {
                pack: global.botName,
                author: pushname || 'Levatain',
                type: StickerTypes.FULL,
                quality: 70,
            });

            await sock.sendMessage(from, { sticker: await sticker.toBuffer() }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });
