import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['slowmo', 'slow'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Slow Motion — audio diperlambat tanpa ubah nada',
    ai: { trigger: 'slow motion', examples: ['slow motion audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'atempo=0.75');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'slowmo.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
