import { typing, downloadMedia, uploadToUrl } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';

export const meta = {
    cmd:  ['removebg', 'rmbg'],
    tag:  'tools',
    aliasOnly: true,
    desc: 'Hapus background dari gambar',
    ai: {
        trigger: 'User minta hapus background gambar, remove bg, atau transparent background',
        examples: ['hapus background foto ini', 'removebg'],
    },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['image']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply gambar dulu.' }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Menghapus background...' }, { quoted: raw });

    try {
        const imageUrl = await uploadToUrl(result.buffer, result.mimetype || 'image/jpeg');
        const output   = await api.removebg(imageUrl);
        await sock.sendMessage(from, { image: { url: output }, caption: '✅ Background dihapus!' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
