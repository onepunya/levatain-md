import { plugin } from '../../src/core/plugin.js';
export default plugin('script', 'sc')
    .in('main')
    .desc('Bot source code / repo info')
    .prefixOnly()
    .signal('User asks to sc/script bot', ['sc', 'script'])
    .run(async (sock, { raw, from }) => {
      const txt = `*LEVATAIN-MD AI-First WhatsApp Bot (contributions welcome)*

    Open-source WhatsApp bot built on Baileys V7 (Node.js). Full downloader features, AI chat that auto-runs plugins with conversation memory, AI-powered image generation & editing, music generation, downloaders (TikTok, YouTube, Instagram, Facebook, Twitter/X, Threads, CapCut), audio changer (bassboost, nightcore, 8D, reverse, etc.), sticker maker, background remover, image upscaler, and group management tools (tagall, warn, welcome/left).

    *Source code:* https://github.com/onepunya/levatain-md.git

    *Community:*
    https://bit.ly/4xcwdXq

    Requires Node.js 20+`;
        await sock.sendMessage(from, { text: txt }, { quoted: raw });
    });

