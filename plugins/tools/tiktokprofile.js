import * as cheerio from 'cheerio';
import { typing, getArgs } from '../../src/lib/utils.js';
import { logger } from '../../src/lib/logger.js';

export const meta = {
    interface: {
        cmd:  ['tiktokprofile', 'ttprofile', 'ttstalk'],
        tag:  'tools',
        aliasOnly: true,
        desc: 'Cek/cari profil TikTok (followers, following, likes, bio, dll)',
        ai: {
            trigger: 'User minta cek/stalk profil TikTok berdasarkan username',
            examples: ['ttprofile jokowi', 'cek profil tiktok @jokowi', 'stalk tiktok jokowi'],
            args: { username: 'Username TikTok tanpa @' },
        },
        async run(sock, { body, raw, from }) {
            const username = getArgs(body).replace('@', '').trim();
            if (!username) return sock.sendMessage(from, {
                text: '❌ Masukkan username TikTok!\nContoh: *.ttprofile jokowi*'
            }, { quoted: raw });

            await typing(sock, from);
            await sock.sendMessage(from, { text: `⏳ Mengambil profil @${username}...` }, { quoted: raw });

            try {
                const html = await fetchTikmatrixProfile(username);
                const data = parseHTMLtoJSON(html);

                if (!data.profile.username) {
                    return sock.sendMessage(from, {
                        text: `❌ Profil @${username} tidak ditemukan atau diblokir Cloudflare.`
                    }, { quoted: raw });
                }

                const { profile, statistics, account_details } = data;
                const caption =
                    `👤 *${profile.name || profile.username}*\n` +
                    `🔗 @${profile.username}\n` +
                    `📝 ${profile.bio || '-'}\n\n` +
                    `👥 Followers: ${statistics.followers.toLocaleString('id-ID')}\n` +
                    `➡️ Following: ${statistics.following.toLocaleString('id-ID')}\n` +
                    `❤️ Hearts: ${statistics.hearts.toLocaleString('id-ID')}\n` +
                    `🎬 Videos: ${statistics.videos.toLocaleString('id-ID')}\n` +
                    `🧑‍🤝‍🧑 Friends: ${statistics.friends.toLocaleString('id-ID')}\n\n` +
                    `🆔 User ID: ${account_details.user_id || '-'}\n` +
                    `📅 Dibuat: ${account_details.created_at}`;

                if (profile.avatar_url) {
                    await sock.sendMessage(from, { image: { url: profile.avatar_url }, caption }, { quoted: raw });
                } else {
                    await sock.sendMessage(from, { text: caption }, { quoted: raw });
                }
            } catch (e) {
                logger.error(`[ttprofile] ${e.message}`);
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

async function fetchTikmatrixProfile(username) {
    const url = `https://user.tikmatrix.com/?username=${encodeURIComponent(username)}`;

    const headers = new Headers({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Referer': 'https://user.tikmatrix.com/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-platform': '"Android"'
    });

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

function parseHTMLtoJSON(html) {
    const $ = cheerio.load(html);
    const parseNumber = (text) => parseInt(text.replace(/,/g, '')) || 0;

    let createdAt = 'N/A';
    $('.detail-item').each((i, el) => {
        const label = $(el).find('.detail-label').text().trim();
        if (label.includes('Account Created')) {
            createdAt = $(el).find('.detail-value').text().trim();
        }
    });

    return {
        profile: {
            name: $('.user-name').text().trim(),
            username: $('.user-handle').text().trim().replace('@', ''),
            bio: $('.user-bio p').first().text().trim(),
            avatar_url: $('.user-avatar').attr('src'),
            language: $('.meta-item').text().replace('🌐', '').trim()
        },
        statistics: {
            followers: parseNumber($('.stat-card').eq(0).find('.stat-number').text()),
            following: parseNumber($('.stat-card').eq(1).find('.stat-number').text()),
            hearts: parseNumber($('.stat-card').eq(2).find('.stat-number').text()),
            videos: parseNumber($('.stat-card').eq(3).find('.stat-number').text()),
            friends: parseNumber($('.stat-card').eq(4).find('.stat-number').text())
        },
        account_details: {
            user_id: $('.userid-text').text().trim(),
            sec_uid: $('.secuid-text').text().trim(),
            created_at: createdAt
        }
    };
}

