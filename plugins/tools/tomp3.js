import { typing, downloadMedia, runFfmpegTempFile } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tomp3', 'toaudio')
    .in('tools')
    .desc('Convert video/audio to mp3')
    .prefixOnly()
    .signal('User asks to convert a video or audio to mp3', ['tomp3', 'convert this video to mp3', 'jadiin audio dong'])
    .run(async (sock, {
        message,
        raw,
        from
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await runFfmpegTempFile(result.buffer, {
                inExt: result.type === 'video' ? 'mp4' : 'bin',
                outExt: 'mp3',
                idPrefix: 'tomp3',
                configure: command => command
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .audioBitrate(128)
                    .format('mp3'),
            });

            await sock.sendMessage(from, {
                audio: out,
                mimetype: 'audio/mpeg',
                fileName: 'audio.mp3',
            }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
        }
    });
