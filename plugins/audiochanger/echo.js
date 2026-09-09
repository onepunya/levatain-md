import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['echo'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Echo — efek gema berulang',
    ai: { trigger: 'echo', examples: ['echo audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'aecho=0.6:0.6:500:0.4');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'echo.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
