import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('8d')
    .in('audiochanger')
    .desc('8D Audio — sound panning left and right')
    .prefixOnly()
    .signal('8d', ['8d audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'apulsator=hz=0.09');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: '8d.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

