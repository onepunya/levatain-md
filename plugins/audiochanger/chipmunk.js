import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['chipmunk'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Chipmunk — suara ngik-ngik kayak tupai',
    ai: { trigger: 'chipmunk', examples: ['chipmunk audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'asetrate=44100*1.6,aresample=44100');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'chipmunk.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
