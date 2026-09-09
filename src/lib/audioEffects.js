import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { typing, downloadMedia } from './utils.js';

export function applyAudioFilter(buffer, filterChain) {
    return new Promise((resolve, reject) => {
        const tempDir    = os.tmpdir();
        const id          = `fx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const inputFile   = path.join(tempDir, `${id}.in`);
        const outputFile  = path.join(tempDir, `${id}.mp3`);

        const cleanup = () => {
            try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile); } catch {}
            try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch {}
        };

        fs.writeFileSync(inputFile, buffer);

        ffmpeg(inputFile)
            .audioFilters(filterChain)
            .audioCodec('libmp3lame')
            .audioBitrate(128)
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

export function makeAudioEffectPlugin({ cmd, tag = 'audiochanger', desc, examples = [], trigger, filter, emoji = '🎧' }) {
    return {
        meta: {
            cmd,
            tag,
            desc,
            ai: {
                trigger: trigger || desc,
                examples,
            },
        },
        async run(sock, { message, raw, from }) {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) {
                return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });
            }

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, filter);
                await sock.sendMessage(
                    from,
                    { audio: out, mimetype: 'audio/mpeg', fileName: `${cmd[0]}.mp3`, caption: `${emoji} ${desc}` },
                    { quoted: raw },
                );
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        },
    };
}
