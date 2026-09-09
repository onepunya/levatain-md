import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['slowed', 'slowedreverb'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Slowed + Reverb — trend TikTok, lambat & bergema',
    ai: { trigger: 'slowed reverb', examples: ['slowed reverb audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.8,aresample=44100,aecho=0.8:0.88:60:0.4');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'slowedreverb.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
