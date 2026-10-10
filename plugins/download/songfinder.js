import { extractSongUrl, api } from '../../src/api/index.js';
import { typing, getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

const LINK_ORDER = ['Spotify', 'Apple Music', 'YouTube Music', 'YouTube', 'Deezer', 'SoundCloud'];

function buildCaption(song) {
    const lines = [`🎶 *${song.title}*`];
    if (song.artist) lines.push(`👤 ${song.artist}`);

    const album = [song.album, song.year && `(${song.year})`].filter(Boolean).join(' ');
    if (album) lines.push(`💿 ${album}`);
    if (song.genre) lines.push(`🎼 ${song.genre}`);

    const labels = [
        ...LINK_ORDER.filter(label => song.links[label]),
        ...Object.keys(song.links).filter(label => !LINK_ORDER.includes(label))
    ];
    if (labels.length) lines.push('', ...labels.map(label => `🔗 ${label}: ${song.links[label]}`));

    lines.push('', `_Want the MP3? Send *.play ${[song.artist, song.title].filter(Boolean).join(' ')}*_`);
    return lines.join('\n');
}

export default plugin('songfinder', 'findsong')
    .in('download')
    .desc('Find the song used in a TikTok or Instagram video from its link')
    .prefixOnly()
    .ai({
        trigger: 'User sends a TikTok or Instagram LINK and asks what song/music/backsound is used in that video or reel (identify the song from a link — NOT downloading the video, NOT an audio/video file)',
        examples: [
            'songfinder https://vt.tiktok.com/xxx',
            'lagu apa di video tiktok ini https://vt.tiktok.com/xxx',
            'backsound reel ini apa https://www.instagram.com/reel/xxx',
        ],
        args: { url: 'TikTok or Instagram URL' },
    })
    .run(async (sock, {
        body,
        raw,
        from,
        message
    }) => {
        const url = extractSongUrl(getArgs(body)) || extractSongUrl(message.quoted?.text);
        if (!url) return sock.sendMessage(from, { text: msg('need.url.songfinder') }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.songfinder') }, { quoted: raw });

        try {
            const song = await api.songFromUrl(url);
            if (!song) return sock.sendMessage(from, { text: msg('fail.not_found') }, { quoted: raw });

            const caption = buildCaption(song);
            if (!song.cover) return sock.sendMessage(from, { text: caption }, { quoted: raw });

            try {
                await sock.sendMessage(from, { image: { url: song.cover }, caption }, { quoted: raw });
            } catch {
                await sock.sendMessage(from, { text: caption }, { quoted: raw });
            }
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });
