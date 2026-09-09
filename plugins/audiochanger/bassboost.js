import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['bassboost', 'bass'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Bass Boost — bass audio dinaikin biar nendang',
    ai: { trigger: 'bass boost', examples: ['bass boost audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'bass=g=20:f=110:w=0.6');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'bassboost.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
