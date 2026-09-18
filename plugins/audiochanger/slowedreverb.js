import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('slowedreverb', 'slowed')
    .in('audiochanger')
    .desc('Slowed + Reverb — TikTok trend, slower and reverbed')
    .prefixOnly()
    .signal('slowed reverb', ['slowed reverb audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.8,aresample=44100,aecho=0.8:0.88:60:0.4');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'slowedreverb.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

