import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('chipmunk')
    .in('audiochanger')
    .desc('Chipmunk — suara ngik-ngik kayak tupai')
    .prefixOnly()
    .signal('chipmunk', ['chipmunk audio ini'])
    .run(async (sock, { message, raw, from }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'asetrate=44100*1.6,aresample=44100');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'chipmunk.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
        }
    });

