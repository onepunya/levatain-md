import { typing, downloadMedia } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['toimg'],
    tag:  'tools',
    aliasOnly: true,
    desc: 'Convert stiker WhatsApp jadi gambar',
    ai: {
        trigger: 'User minta convert stiker jadi gambar atau foto',
        examples: ['stiker ini jadiin gambar', 'toimg'],
    },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['sticker']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply stiker dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        await sock.sendMessage(from, { image: result.buffer, caption: '✅ Stiker → Gambar' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
