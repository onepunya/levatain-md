import { typing, getArgs, api, MAX_FILE_SIZE, cleanupTempFile, ProgressMessage, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('ytmp3', 'ytmp4')
    .in('download')
    .desc('Download audio/video from a YouTube URL')
    .showAllAliases()
    .ai({
        trigger: 'User asks to download from YouTube with a URL, ytmp3 or ytmp4',
        examples: ['ytmp3 https://youtu.be/xxx', 'download youtube ini jadi mp4'],
        args: { url: 'Valid YouTube URL' },
    })
    .run(async (sock, { body, raw, from, command, db, primaryId }) => {
        const url = getArgs(body);
        const format = command === 'ytmp3' ? 'mp3' : 'mp4';

        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.yt')
        }, { quoted: raw });

        await typing(sock, from);

        let filePath = null;
        const bar = new ProgressMessage(sock, from, raw);
        await bar.start(msg('wait.yt_dl', { format: format.toUpperCase() }), 0);

        try {
            const data = await api.ytdl(url, format, percent => bar.update(msg('wait.yt_dl', { format: format.toUpperCase() }), percent));
            filePath = data.url;

            if (data.size > MAX_FILE_SIZE) {
                cleanupTempFile(filePath);
                await bar.fail(msg('fail.media_large', { mb: (data.size / 1024 / 1024).toFixed(1) }));
                return;
            }

            await bar.done(msg('wait.yt_send', { title: data.title }));

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
            await bar.fail(msg('fail.generic', { msg: e.message }));
        } finally {
            cleanupTempFile(filePath);
        }
    });

