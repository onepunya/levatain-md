import { runFfmpegTempFile } from '../utils.js';

export function extractAudioClip(buffer, seconds = 20) {
    return runFfmpegTempFile(buffer, {
        inExt: 'in',
        outExt: 'mp3',
        idPrefix: 'rec',
        configure: command => command
            .noVideo()
            .duration(seconds)
            .audioChannels(1)
            .audioFrequency(44100)
            .audioCodec('libmp3lame')
            .format('mp3'),
    });
}
