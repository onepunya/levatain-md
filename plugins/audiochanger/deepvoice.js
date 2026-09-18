import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('deepvoice', 'deep')
    .in('audiochanger')
    .desc('Deep Voice — makes voice deep and heavy')
    .prefixOnly()
    .signal('deep voice', ['deep voice audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.7,aresample=44100');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'deepvoice.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

