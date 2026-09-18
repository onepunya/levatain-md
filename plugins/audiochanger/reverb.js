import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('reverb')
    .in('audiochanger')
    .desc('Reverb — large room reverb effect')
    .prefixOnly()
    .signal('reverb', ['reverb audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'aecho=0.8:0.9:1000:0.3');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'reverb.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

