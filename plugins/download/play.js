import { typing, getArgs, downloadMedia } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';
import { MAX_FILE_SIZE, cleanupTempFile } from '../../src/lib/youtube.js';
import { ProgressMessage } from '../../src/lib/progress.js';
import { extractAudioClip } from '../../src/lib/audioEffects.js';

export const meta = {
    interface: {
        cmd:  ['play'],
        tag:  'download',
        aliasOnly: true,
        desc: 'Cari & download lagu jadi MP3, atau kenali lagu dari audio/video yang direply',
        ai: {
            trigger: 'User minta putar lagu, download musik, dengerin lagu tertentu, atau reply/kirim audio/video sambil minta dicariin judul lagunya',
            examples: [
                'play shape of you',
                'puterin lagu bohemian rhapsody',
                'download lagu taylor swift',
                'cariin lagu ini dong',
                'ini lagu apa ya',
                'judul lagu di video ini apa',
            ],
            args: { query: 'Judul atau artis lagu (boleh kosong kalau reply audio/video)' },
        },
        async run(sock, { body, raw, from, message }) {
            const bar = new ProgressMessage(sock, from, raw);
            let filePath = null;
            let searchQuery = getArgs(body);

            try {
                if (!searchQuery) {
                    const media = await downloadMedia(raw, message.quoted, ['audio', 'video']);
                    if (!media) {
                        return sock.sendMessage(from, {
                            text: '❌ Masukkan judul lagu, atau reply/kirim audio/video yang ada lagunya!'
                        }, { quoted: raw });
                    }

                    await typing(sock, from);
                    await bar.start('🎧 Mendengarkan lagu...');

                    let clip;
                    try {
                        clip = await extractAudioClip(media.buffer, 10);
                    } catch (e) {
                        await bar.fail(`Gagal memproses audio: ${e.message}`);
                        return;
                    }

                    let recognized;
                    try {
                        recognized = await api.recognizeSong(clip);
                    } catch (e) {
                        await bar.fail(`Gagal mengenali lagu: ${e.message}`);
                        return;
                    }

                    if (!recognized) {
                        await bar.fail('Gak ketemu lagunya 😔 coba reply potongan yang lebih jelas / gak banyak noise.');
                        return;
                    }

                    searchQuery = `${recognized.artist} ${recognized.title}`.trim();
                    const via = recognized.source === 'kode S' ? 'kode S' : recognized.source === 'kode A' ? 'kode A' : '';
                    await bar.stage(`🎶 Ketemu${via ? ` (${via})` : ''}: ${recognized.artist} - ${recognized.title}`, true);
                } else {
                    await typing(sock, from);
                    await bar.start('🔍 Mencari lagu...');
                }

                const data = await api.ytplay(searchQuery, percent => bar.update('⬇️ Mengunduh & mengonversi...', percent));
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
