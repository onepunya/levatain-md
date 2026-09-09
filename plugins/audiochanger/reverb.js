import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['reverb'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Reverb — efek gema ruangan besar',
    ai: { trigger: 'reverb', examples: ['reverb audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'aecho=0.8:0.9:1000:0.3');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'reverb.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
