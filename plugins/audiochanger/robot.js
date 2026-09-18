import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('robot')
    .in('audiochanger')
    .desc('Robot Voice — makes voice sound like a robot')
    .prefixOnly()
    .signal('robot voice', ['robot voice audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, FILTER);
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'robot.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

const FILTER = "afftfilt=real='hypot(re,im)*cos(0.05*n)':imag='hypot(re,im)*sin(0.05*n)':win_size=512:overlap=0.75";

