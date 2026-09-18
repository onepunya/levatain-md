import { typing, getArgs, downloadMedia, api, MAX_FILE_SIZE, cleanupTempFile, ProgressMessage, extractAudioClip, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('play')
    .in('download')
    .desc('Search & download a song as MP3, or recognize a song from replied audio/video')
    .prefixOnly()
    .ai({
        trigger: 'User asks to play a song, download music, or listen to a track, or reply/send audio/video',
        examples: [
            'play shape of you',
            'play bohemian rhapsody',
            'download taylor swift song',
            'find this song',
            'what song is this',
            'what is the song in this video',
        ],
        args: { query: 'Song title or artist (can be empty if replying to audio/video)' },
    })
    .run(async (sock, { body, raw, from, message, db, primaryId }) => {
        const bar = new ProgressMessage(sock, from, raw);
        let filePath = null;
        let searchQuery = getArgs(body);

        try {
            if (!searchQuery) {
                const media = await downloadMedia(raw, message.quoted, ['audio', 'video']);
                if (!media) {
                    return sock.sendMessage(from, {
                        text: msg('need.play')
                    }, { quoted: raw });
                }

                await typing(sock, from);
                await bar.start(msg('wait.listening'));

                let clip;
                try {
                    clip = await extractAudioClip(media.buffer, 10);
                } catch (e) {
                    await bar.fail(msg('fail.audio', { msg: e.message }));
                    return;
                }

                let recognized;
                try {
                    recognized = await api.recognizeSong(clip);
                } catch (e) {
                    await bar.fail(msg('fail.generic', { msg: e.message }));
                    return;
                }

                if (!recognized) {
                    await bar.fail(msg('fail.not_found') + ' Try a clearer clip with less noise.');
                    return;
                }

                searchQuery = `${recognized.artist} ${recognized.title}`.trim();
                const via = recognized.source === 'kode S' ? 'kode S' : recognized.source === 'kode A' ? 'kode A' : '';
                await bar.stage(`🎶 Found${via ? ` (${via})` : ''}: ${recognized.artist} - ${recognized.title}`, true);
            } else {
                await typing(sock, from);
                await bar.start('🔍 Searching for song...');
            }

            const data = await api.ytplay(searchQuery, percent => bar.update('⬇️ Downloading & converting...', percent));
            filePath = data.url;

            if (data.size > MAX_FILE_SIZE) {
                cleanupTempFile(filePath);
                await bar.fail(msg('fail.media_large', { mb: (data.size / 1024 / 1024).toFixed(1) }));
                return;
            }

            await bar.done(msg('wait.yt_send', { title: data.title }));

            await sock.sendMessage(from, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`,
                ptt: false,
            }, { quoted: raw });

        } catch (e) {
            await bar.fail(msg('fail.generic', { msg: e.message }));
        } finally {
            cleanupTempFile(filePath);
        }
    });

