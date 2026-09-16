import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { typing, downloadMedia } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('sticker', 's')
  .in('tools')
  .desc('Convert gambar/video jadi stiker WhatsApp')
  .prefixOnly()
  .signal('User minta buat stiker dari gambar atau video yang dikirim', ['jadiin stiker', 'bikin sticker dari gambar ini'])
  .run(async (sock, { message, raw, from, pushname }) => {
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
        });

