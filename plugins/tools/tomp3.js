import { downloadMedia, runFfmpegTempFile } from '../../src/util/index.js';
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
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
        if (!result) return reply(msg('need.audio_video'));

        await typing();
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

            await reply({
                audio: out,
                mimetype: 'audio/mpeg',
                fileName: 'audio.mp3',
            });
        } catch (e) {
            await reply(msg('fail.audio', { msg: e.message }));
        }
    });
