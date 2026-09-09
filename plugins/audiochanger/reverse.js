import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['reverse'],
    tag:  'audiochanger',
    aliasOnly: true,
    desc: 'Reverse — audio dibalik dari belakang',
    ai: { trigger: 'reverse', examples: ['reverse audio ini'] },
};

export async function run(sock, { message, raw, from }) {
    const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
    if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

    await typing(sock, from);
    try {
        const out = await applyAudioFilter(result.buffer, 'areverse');
        await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'reverse.mp3' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
    }
}
