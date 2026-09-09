import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['8d'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: '8D Audio — suara muter kiri-kanan',
    ai: { trigger: '8d', examples: ['8d audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'apulsator=hz=0.09');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: '8d.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
