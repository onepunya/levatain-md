import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { uniqueId } from '../utils.js';

export function extractAudioClip(buffer, seconds = 20) {
    return new Promise((resolve, reject) => {
        const tempDir    = os.tmpdir();
        const id          = uniqueId('rec');
        const inputFile   = path.join(tempDir, `${id}.in`);
        const outputFile  = path.join(tempDir, `${id}.mp3`);

        const cleanup = () => {
            try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile); } catch {}
            try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch {}
        };

        fs.writeFileSync(inputFile, buffer);

        ffmpeg(inputFile)
            .noVideo()
            .duration(seconds)
            .audioChannels(1)
            .audioFrequency(44100)
            .audioCodec('libmp3lame')
            .format('mp3')
            .on('end', () => {
                try {
                    const out = fs.readFileSync(outputFile);
                    cleanup();
                    resolve(out);
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            })
            .on('error', error => {
                cleanup();
                reject(error);
            })
            .save(outputFile);
    });
}
