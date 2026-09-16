import { typing, downloadMedia } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('toimg')
    .in('tools')
    .desc('Convert stiker WhatsApp jadi gambar')
    .prefixOnly()
    .signal('User minta convert stiker jadi gambar atau foto', ['stiker ini jadiin gambar', 'toimg'])
    .run(async (sock, { message, raw, from }) => {
        const result = await downloadMedia(raw, message.quoted, ['sticker']);
        if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply stiker dulu.' }, { quoted: raw });

        await typing(sock, from);
        try {
            await sock.sendMessage(from, { image: result.buffer, caption: '✅ Stiker → Gambar' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
        }
    });

