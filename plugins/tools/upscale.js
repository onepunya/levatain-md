import { typing, downloadMedia } from '../../src/lib/utils.js';
import { upscaleImage } from '../../src/lib/photiu.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('upscale', 'hd', 'enhance')
    .in('tools')
    .desc('Tingkatkan resolusi/kualitas gambar (HD-in foto)')
    .prefixOnly()
    .cooldown(15)
    .signal('User minta upscale gambar, perbesar resolusi foto, HD-in foto, perjelas gambar buram', ['upscale foto ini', 'hd-in dong', 'perjelas gambar ini'])
    .run(async (sock, { message, raw, from }) => {
        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply gambar dulu.' }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: '⏳ Meningkatkan kualitas gambar, tunggu bentar...' }, { quoted: raw });

        try {
            const output = await upscaleImage(result.buffer, result.mimetype || 'image/jpeg');
            const media  = Buffer.isBuffer(output) ? { image: output } : { image: { url: output } };
            await sock.sendMessage(from, { ...media, caption: '✅ Gambar berhasil di-upscale!' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal upscale: ${e.message}\n\n(endpoint tidak resmi, kalau sering gagal kemungkinan photiu.ai ubah struktur API-nya)` }, { quoted: raw });
        }
    });

