import { api, MAX_FILE_SIZE, cleanupTempFile } from '../../src/api/index.js';
import { getArgs } from '../../src/util/index.js';
import { ProgressMessage, msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('play')
    .in('download')
    .desc('Search & download a song as MP3 by title/artist')
    .prefixOnly()
    .ai({
        trigger: 'User asks to play a song or download music by title/artist',
        examples: [
            'play shape of you',
            'play bohemian rhapsody',
            'download taylor swift song',
            'play ed sheeran perfect',
        ],
        args: { query: 'Song title or artist' },
    })
    .run(async (sock, {
        body,
        raw,
        from,
        reply,
        typing
    }) => {
        const searchQuery = getArgs(body);
        if (!searchQuery) {
            return reply(msg('need.query') + '\nExample: *.play shape of you*');
        }

        const bar = new ProgressMessage(sock, from, raw);
        let filePath = null;

        try {
            await typing();
            await bar.start('🔍 Searching for song...');

            const data = await api.ytplay(searchQuery, percent => bar.update('⬇️ Downloading & converting...', percent));
            filePath = data.url;

            if (data.size > MAX_FILE_SIZE) {
                cleanupTempFile(filePath);
                await bar.fail(msg('fail.media_large', { mb: (data.size / 1024 / 1024).toFixed(1) }));
                return;
            }

            await bar.done(msg('wait.yt_send', { title: data.title }));

            await reply({
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`,
                ptt: false,
            });
        } catch (e) {
            await bar.fail(msg('fail.generic', { msg: e.message }));
        } finally {
            cleanupTempFile(filePath);
        }
    });
