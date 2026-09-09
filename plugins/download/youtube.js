import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';
import { MAX_FILE_SIZE, cleanupTempFile } from '../../src/lib/youtube.js';
import { ProgressMessage } from '../../src/lib/progress.js';

export const meta = {
    cmd:  ['ytmp3', 'ytmp4'],
    tag:  'download',
    aliasOnly: false,
    desc: 'Download audio/video dari URL YouTube',
    ai: {
        trigger: 'User minta download dari YouTube dengan URL, ytmp3 atau ytmp4',
        examples: ['ytmp3 https://youtu.be/xxx', 'download youtube ini jadi mp4'],
        args: { url: 'URL YouTube yang valid' },
    },
};

export async function run(sock, { body, raw, from, command }) {
    const url = getArgs(body);
    const format = command === 'ytmp3' ? 'mp3' : 'mp4';

    if (!url) return sock.sendMessage(from, {
        text: '❌ URL tidak ditemukan! Silakan masukkan link YouTube yang valid.'
    }, { quoted: raw });

    await typing(sock, from);

    let filePath = null;
    const bar = new ProgressMessage(sock, from, raw);
    await bar.start(`⬇️ Mengunduh ${format.toUpperCase()}...`, 0);

    try {
        const data = await api.ytdl(url, format, percent => bar.update(`⬇️ Mengunduh ${format.toUpperCase()}...`, percent));
        filePath = data.url;

        if (data.size > MAX_FILE_SIZE) {
            cleanupTempFile(filePath);
            await bar.fail(`File terlalu besar (${(data.size / 1024 / 1024).toFixed(1)}MB). Batas maksimal 15MB.`);
            return;
        }

        await bar.done(`✅ ${data.title}\nMengirim...`);

        if (format === 'mp3') {
            await sock.sendMessage(from, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`,
                ptt: false,
            }, { quoted: raw });
        } else {
            await sock.sendMessage(from, {
                video: { url: filePath },
                mimetype: 'video/mp4',
                caption: `🎬 ${data.title}`
            }, { quoted: raw });
        }

    } catch (e) {
        await bar.fail(`Gagal: ${e.message}`);
    } finally {
        cleanupTempFile(filePath);
    }
}
