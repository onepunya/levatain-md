import { typing, downloadMedia, runFfmpegTempFile } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

const PTV_SIZE = 480;          
const PTV_MAX_SECONDS = 60;

export default plugin('ptv', 'toptv', 'videotoptv')
    .in('tools')
    .desc('Convert a video into a round video note (PTV)')
    .prefixOnly()
    .signal('User asks to convert a video into a round video message / video note (PTV)', ['ptv', 'video to ptv', 'jadiin ptv dong'])
    .run(async (sock, {
        message,
        raw,
        from
    }) => {
        let result;
        try {
            result = await downloadMedia(raw, message.quoted, ['video']);
        } catch (e) {
            return sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
        if (!result) return sock.sendMessage(from, { text: msg('need.video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const out = await runFfmpegTempFile(result.buffer, {
                inExt: 'src',
                outExt: 'mp4',
                idPrefix: 'ptv',
                configure: command => command
                    .setDuration(PTV_MAX_SECONDS)
                    .videoFilters(`crop=min(iw\\,ih):min(iw\\,ih),scale=${PTV_SIZE}:${PTV_SIZE}`)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .audioBitrate(64)
                    .outputOptions(['-pix_fmt yuv420p', '-preset veryfast', '-crf 28', '-r 30', '-movflags +faststart'])
                    .format('mp4'),
            });

            await sock.sendMessage(from, {
                video: out,
                ptv: true,
                mimetype: 'video/mp4',
            }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });
