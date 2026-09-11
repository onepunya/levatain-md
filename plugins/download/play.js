import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';
import { MAX_FILE_SIZE, cleanupTempFile } from '../../src/lib/youtube.js';
import { ProgressMessage } from '../../src/lib/progress.js';

export const meta = {
    interface: {
        cmd:  ['play'],
        tag:  'download',
        aliasOnly: true,
        desc: 'Cari dan download lagu sebagai audio MP3',
        ai: {
            trigger: 'User minta putar lagu, download musik, dengerin lagu tertentu',
            examples: ['play shape of you', 'puterin lagu bohemian rhapsody', 'download lagu taylor swift'],
            args: { query: 'Judul atau artis lagu' },
        },
        async run(sock, { body, raw, from }) {
            const query = getArgs(body);
            if (!query) return sock.sendMessage(from, {
                text: '❌ Silakan masukkan judul lagu!'
            }, { quoted: raw });

            await typing(sock, from);

            let filePath = null;
            const bar = new ProgressMessage(sock, from, raw);
            await bar.start('🔍 Mencari lagu...');

            try {
                const data = await api.ytplay(query, percent => bar.update('⬇️ Mengunduh & mengonversi...', percent));
                filePath = data.url;

                if (data.size > MAX_FILE_SIZE) {
                    cleanupTempFile(filePath);
                    await bar.fail(`File terlalu besar (${(data.size / 1024 / 1024).toFixed(1)}MB). Batas maksimal 15MB.`);
                    return;
                }

                await bar.done(`✅ ${data.title}\nMengirim...`);

                await sock.sendMessage(from, {
                    audio: { url: filePath },
                    mimetype: 'audio/mpeg',
                    fileName: `${data.title}.mp3`,
                    ptt: false,
                }, { quoted: raw });

            } catch (e) {
                await bar.fail(`Gagal: ${e.message}`);
            } finally {
                cleanupTempFile(filePath);
            }
        },
    },
};

