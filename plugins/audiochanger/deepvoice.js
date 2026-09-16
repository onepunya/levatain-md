import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('deepvoice', 'deep')
    .in('audiochanger')
    .desc('Deep Voice — suara jadi berat/dalam')
    .prefixOnly()
    .signal('deep voice', ['deep voice audio ini'])
    .run(async (sock, { message, raw, from }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.7,aresample=44100');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'deepvoice.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
        }
    });

