import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('slowmo', 'slow')
    .in('audiochanger')
    .desc('Slow Motion — audio diperlambat tanpa ubah nada')
    .prefixOnly()
    .signal('slow motion', ['slow motion audio ini'])
    .run(async (sock, { message, raw, from }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'atempo=0.75');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'slowmo.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
        }
    });

