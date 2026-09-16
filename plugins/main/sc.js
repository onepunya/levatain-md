import { plugin } from '../../src/core/plugin.js';
export default plugin('script', 'sc')
  .in('main')
  .desc('file scrpit bot levatain md')
  .prefixOnly()
  .signal('User minta sc/script bot', ['sc', 'script'])
  .run(async (sock, { raw, from }) => {
          const txt = `*LEVATAIN-MD Bot WhatsApp AI-First (invite kontribusi)*

        Bot WhatsApp open source berbasis Baileys V7 (Node.js). Fitur downloader lengkap, AI chat otomatis run plugin dengan memory percakapan, generate & edit gambar pakai AI, generate musik, downloader (TikTok, YouTube, Instagram, Facebook, Twitter/X, Threads, CapCut), audio changer (bassboost, nightcore, 8D, reverse, dll), sticker maker, remove background, upscale gambar, dan tools manajemen grup (tagall, warn, welcome/left).

        *Source code:* https://github.com/onepunya/levatain-md.git

        *Komunitas:*
        https://bit.ly/4xcwdXq

        Butuh Node.js 20+`;
            await sock.sendMessage(from, { text: txt }, { quoted: raw });
        });

