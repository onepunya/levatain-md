import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('bassboost', 'bass')
    .in('audiochanger')
    .desc('Bass Boost — boosted low frequencies')
    .prefixOnly()
    .signal('bass boost', ['bass boost audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'bass=g=20:f=110:w=0.6');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'bassboost.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

