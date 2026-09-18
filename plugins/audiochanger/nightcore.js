import { applyAudioFilter, downloadMedia, typing, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('nightcore')
    .in('audiochanger')
    .desc('Nightcore — faster audio with higher pitch')
    .prefixOnly()
    .signal('nightcore', ['nightcore audio ini'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await applyAudioFilter(result.buffer, 'asetrate=44100*1.3,aresample=44100');
            await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'nightcore.mp3' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });

