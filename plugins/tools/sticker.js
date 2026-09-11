import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { typing, downloadMedia } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['sticker', 's'],
        tag:  'tools',
        aliasOnly: true,
        desc: 'Convert gambar/video jadi stiker WhatsApp',
        ai: {
            trigger: 'User minta buat stiker dari gambar atau video yang dikirim',
            examples: ['jadiin stiker', 'bikin sticker dari gambar ini'],
        },
        async run(sock, { message, raw, from, pushname }) {
            const result = await downloadMedia(raw, message.quoted, ['image', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply gambar/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const sticker = new Sticker(result.buffer, {
                    pack:    global.botName,
                    author:  pushname || 'Levatain',
                    type:    StickerTypes.FULL,
                    quality: 70,
                });
                await sock.sendMessage(from, { sticker: await sticker.toBuffer() }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

