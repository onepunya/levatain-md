import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../util/logger.js';
import { MAX_MEDIA_BYTES } from '../media/mediaLimit.js';
import { uniqueId } from '../util/utils.js';

export const MAX_FILE_SIZE = MAX_MEDIA_BYTES;

export const cleanupTempFile = file => {
    if (!file) return;
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, {
        ...opts,
        signal: opts.signal || AbortSignal.timeout(opts.timeout || 20000),
        headers: {
            'user-agent': UA,
            'accept': 'application/json, text/plain, */*',
            ...(opts.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

const fetchText = async (url, opts = {}) => {
    const res = await fetch(url, {
        ...opts,
        signal: opts.signal || AbortSignal.timeout(opts.timeout || 20000),
        headers: {
            'user-agent': UA,
            ...(opts.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
        text: await res.text(),
        headers: res.headers,
        status: res.status,
    };
};

export function extractVideoId(url) {
    if (!url) return null;
    let match = null;
    if (url.includes('youtube.com/shorts/') || url.includes('youtu.be/')) {
        match = /\/([a-zA-Z0-9\-_]{11})/.exec(url);
    } else if (url.includes('youtube.com')) {
        match = /v=([a-zA-Z0-9\-_]{11})/.exec(url);
    } else {
        match = /[a-zA-Z0-9\-_]{11}/.exec(url);
    }
    return match ? match[1] : null;
}

const requestFollow = (url, headers, redirectsLeft, onResponse, onError) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers }, res => {
        const { statusCode, headers: resHeaders } = res;
        if (statusCode >= 300 && statusCode < 400 && resHeaders.location && redirectsLeft > 0) {
            res.resume();
            const nextUrl = new URL(resHeaders.location, url).toString();
            requestFollow(nextUrl, headers, redirectsLeft - 1, onResponse, onError);
            return;
        }
        onResponse(res);
    });
    req.on('error', onError);
    return req;
};

const streamDownload = (url, headers, outputFile, onProgress) => new Promise((resolve, reject) => {
    let inactivityTimer;
    let activeReq;
    const resetInactivity = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => activeReq?.destroy(new Error('Connection stalled (120s no data).')), 120000);
    };
    resetInactivity();

    const finish = error => {
        clearTimeout(inactivityTimer);
        error ? reject(error) : resolve();
    };

    activeReq = requestFollow(url, headers, 5, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
            res.destroy();
            return finish(new Error(`Invalid source (HTTP ${res.statusCode})`));
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            res.destroy();
            return finish(new Error(`Invalid source (response ${contentType || 'unknown'}, not a media file)`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        if (total > MAX_FILE_SIZE) {
            res.destroy();
            return finish(new Error(`File too large (${(total / 1024 / 1024).toFixed(1)}MB). Limit is 15MB.`));
        }

        let loaded = 0;
        const writer = fs.createWriteStream(outputFile);

        res.on('data', chunk => {
            resetInactivity();
            loaded += chunk.length;
            if (loaded > MAX_FILE_SIZE) {
                res.destroy(new Error('File too large. Max 15MB.'));
                return;
            }
            if (onProgress && total > 0) {
                onProgress(Math.min(99, Math.round((loaded / total) * 100)));
            }
        });

        pipeline(res, writer)
            .then(() => finish())
            .catch(error => { writer.destroy(); finish(error); });
    }, finish);
}).then(() => {
    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
        throw new Error('Failed to download file: empty result.');
    }
    return fs.statSync(outputFile).size;
});

const probeMedia = file => new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
        if (err) return reject(new Error('Downloaded file is corrupted or not valid media.'));
        resolve(data);
    });
});

const remuxFaststart = (inputFile, outputFile) => new Promise((resolve, reject) => {
    ffmpeg(inputFile)
        .outputOptions(['-c copy', '-movflags +faststart'])
        .format('mp4')
        .on('error', error => reject(error))
        .on('end', () => resolve())
        .save(outputFile);
});

const SAVETUBE_KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';

function decryptSavetube(base64) {
    const raw = Buffer.from(base64, 'base64');
    const iv = raw.subarray(0, 16);
    const encrypted = raw.subarray(16);
    const key = Buffer.from(SAVETUBE_KEY_HEX, 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}

async function getSavetubeCdn() {
    const data = await fetchJson('https://media.savetube.vip/api/random-cdn', { timeout: 10000 });
    if (!data?.cdn) throw new Error('Failed to get Savetube CDN');
    return data.cdn;
}

async function savetubeDownload(videoUrl, type = 'audio', quality = '128') {
    const cdn = await getSavetubeCdn();
    const infoRes = await fetchJson(`https://${cdn}/v2/info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
        timeout: 15000,
    });
    if (!infoRes.status) throw new Error(infoRes.message || 'Failed to get video info');
    const info = decryptSavetube(infoRes.data);
    const dlRes = await fetchJson(`https://${cdn}/download`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            downloadType: type,
            quality,
            key: info.key,
        }),
        timeout: 20000,
    });
    const downloadUrl = dlRes.data?.downloadUrl || '';
    if (!downloadUrl) throw new Error('Savetube returned empty download URL');
    return {
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.durationLabel,
        downloadUrl,
        type,
        backend: 'savetube',
    };
}

async function ytmp3IngDownload(videoUrl) {
    const page = await fetchText('https://ytmp3.ing/', { timeout: 10000 });
    const setCookie = page.headers.getSetCookie?.() || [];
    const cookie = setCookie.join('; ') || page.headers.get('set-cookie') || '';
    const csrf = page.text.match(/value="([^"]+)"/)?.[1];
    if (!csrf) throw new Error('Failed to get CSRF token from ytmp3.ing');

    const boundary = '----WebKitFormBoundaryAzbry';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="url"\r\n\r\n${videoUrl}\r\n--${boundary}--\r\n`;

    const res = await fetch('https://ytmp3.ing/audio', {
        method: 'POST',
        headers: {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'x-csrftoken': csrf,
            cookie,
            'user-agent': UA,
        },
        body,
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`ytmp3.ing HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.url) throw new Error('ytmp3.ing returned empty URL');
    const downloadUrl = Buffer.from(data.url, 'base64').toString('utf8');
    return {
        title: data.filename || 'Unknown',
        downloadUrl,
        format: 'mp3',
        backend: 'ytmp3ing',
    };
}

const JAKY_API_KEYS = ['jK54EBE6E8', 'jK54EBE6E8'];
let jakyKeyCursor = 0;
const nextJakyKey = () => {
    const key = JAKY_API_KEYS[jakyKeyCursor % JAKY_API_KEYS.length];
    jakyKeyCursor++;
    return key;
};

const jakyInfo = async (youtubeUrl, format, quality) => {
    const apiUrl = `https://api.jaky.dev/v1/download/youtube?url=${encodeURIComponent(youtubeUrl)}&format=${format}&quality=${quality}`;
    const res = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'x-jaky-key': nextJakyKey(), 'user-agent': UA },
        signal: AbortSignal.timeout(30000),
    });
    const body = await res.json();
    if (!body || body.status !== true || !body.result?.downloadUrl) {
        throw new Error(`jaky info failed: ${JSON.stringify(body).slice(0, 150)}`);
    }
    return {
        title: body.result.title,
        thumbnail: body.result.thumbnail || null,
        downloadUrl: body.result.downloadUrl,
        backend: 'jaky',
    };
};

async function youtubeHtmlSearch(query) {
    const { text: html } = await fetchText('https://www.youtube.com/results?' + new URLSearchParams({ search_query: query }), {
        timeout: 15000,
        headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    const match =
        html?.match(/var ytInitialData = (\{[\s\S]*?\});/) ||
        html?.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*var/);
    if (!match) throw new Error('Failed to parse YouTube search data');
    const json = JSON.parse(match[1]);
    const contents =
        json.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
    if (!contents) return [];
    return contents
        .filter(c => c.videoRenderer)
        .map(c => {
            const d = c.videoRenderer;
            return {
                id: d.videoId,
                url: `https://www.youtube.com/watch?v=${d.videoId}`,
                title: d.title?.runs?.[0]?.text || '',
                author: d.ownerText?.runs?.[0]?.text || '',
                duration: d.lengthText?.simpleText || '',
                thumbnail: `https://i.ytimg.com/vi/${d.videoId}/hqdefault.jpg`,
            };
        });
}

async function resolveVideoMeta(query) {
    if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(query || '').trim())) {
        const videoUrl = query.trim();
        const vidId = extractVideoId(videoUrl);
        return {
            id: vidId,
            url: videoUrl,
            title: 'YouTube',
            author: 'YouTube',
            duration: '-',
            thumbnail: vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : '',
        };
    }

    try {
        const results = await youtubeHtmlSearch(query);
        if (results.length) return results[0];
    } catch (e) {
        logger.warn(`[yt:search] html scrape failed: ${e.message}`);
    }

    const searchResult = await yts(query);
    const video = searchResult.videos[0];
    if (!video) throw new Error('No results found.');
    return {
        id: video.videoId,
        url: video.url,
        title: video.title,
        author: video.author?.name || 'YouTube',
        duration: video.timestamp || '-',
        thumbnail: video.thumbnail,
    };
}

async function getDownloadLink(videoUrl, format) {
    const errors = [];

    if (format === 'mp3') {
        try {
            return await savetubeDownload(videoUrl, 'audio', '128');
        } catch (e) {
            errors.push(`savetube: ${e.message}`);
            logger.warn(`[yt] savetube audio failed: ${e.message}`);
        }
        try {
            return await ytmp3IngDownload(videoUrl);
        } catch (e) {
            errors.push(`ytmp3ing: ${e.message}`);
            logger.warn(`[yt] ytmp3.ing failed: ${e.message}`);
        }
        try {
            return await jakyInfo(videoUrl, 'mp3', 128);
        } catch (e) {
            errors.push(`jaky: ${e.message}`);
            logger.warn(`[yt] jaky audio failed: ${e.message}`);
        }
    } else {
        try {
            return await savetubeDownload(videoUrl, 'video', '720');
        } catch (e) {
            errors.push(`savetube: ${e.message}`);
            logger.warn(`[yt] savetube video failed: ${e.message}`);
        }
        try {
            return await jakyInfo(videoUrl, 'mp4', 720);
        } catch (e) {
            errors.push(`jaky: ${e.message}`);
            logger.warn(`[yt] jaky video failed: ${e.message}`);
        }
    }

    throw new Error(`All download backends failed: ${errors.join(' | ')}`);
}

export const ytDownload = async (youtubeUrl, formatReq = 'mp4', onProgress) => {
    const format = formatReq === 'mp3' ? 'mp3' : 'mp4';
    const tempDir = os.tmpdir();
    const id = uniqueId('yt');
    const finalMp4 = path.join(tempDir, `${id}.mp4`);
    const finalMp3 = path.join(tempDir, `${id}.mp3`);
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const rawFile = path.join(tempDir, `${id}.raw.${ext}`);

    try {
        const link = await getDownloadLink(youtubeUrl, format);
        await streamDownload(link.downloadUrl, { 'user-agent': UA }, rawFile, onProgress);
        try {
            await probeMedia(rawFile);
        } catch {}

        const title = link.title || 'YouTube';
        const thumbnail = link.thumbnail || null;

        if (format === 'mp3') {
            fs.copyFileSync(rawFile, finalMp3);
            cleanupTempFile(rawFile);
            if (!fs.existsSync(finalMp3) || fs.statSync(finalMp3).size <= 0) {
                throw new Error('MP3 file was not created successfully.');
            }
            const size = fs.statSync(finalMp3).size;
            if (size > MAX_FILE_SIZE) {
                cleanupTempFile(finalMp3);
                throw new Error(`File size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds 15MB limit.`);
            }
            return { title, thumbnail, format: 'mp3', url: finalMp3, size, isTempFile: true, backend: link.backend };
        }

        try {
            await remuxFaststart(rawFile, finalMp4);
        } catch {
            fs.copyFileSync(rawFile, finalMp4);
        }
        cleanupTempFile(rawFile);

        const size = fs.statSync(finalMp4).size;
        if (size > MAX_FILE_SIZE) {
            cleanupTempFile(finalMp4);
            throw new Error(`File size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds 15MB limit.`);
        }
        return { title, thumbnail, format: 'mp4', url: finalMp4, size, isTempFile: true, backend: link.backend };
    } catch (error) {
        try { logger.error(`[ytDownload] ${error.message}`); } catch {}
        cleanupTempFile(rawFile);
        cleanupTempFile(finalMp4);
        cleanupTempFile(finalMp3);
        throw error;
    }
};

export const ytHandler = {
    download: async (url, format = 'mp4', onProgress) => await ytDownload(url, format, onProgress),

    search: async query => {
        try {
            const results = await youtubeHtmlSearch(query);
            if (results.length) {
                return results.slice(0, 5).map(v => ({
                    title: v.title,
                    url: v.url,
                    timestamp: v.duration,
                    views: null,
                    author: v.author,
                    thumbnail: v.thumbnail,
                }));
            }
        } catch (e) {
            logger.warn(`[yt:search] scrape failed, fallback yt-search: ${e.message}`);
        }
        const searchResult = await yts(query);
        const videos = searchResult.videos.slice(0, 5);
        if (!videos.length) throw new Error('Video not found.');
        return videos.map(v => ({
            title: v.title,
            url: v.url,
            timestamp: v.timestamp,
            views: v.views,
            author: v.author.name,
            thumbnail: v.thumbnail,
        }));
    },

    play: async (query, onProgress) => {
        const video = await resolveVideoMeta(query);
        const downloadResult = await ytDownload(video.url, 'mp3', onProgress);
        return {
            title: downloadResult.title !== 'YouTube' ? downloadResult.title : video.title,
            channel: video.author,
            duration: video.duration,
            thumbnail: downloadResult.thumbnail || video.thumbnail,
            url: downloadResult.url,
            size: downloadResult.size,
            sourceVideo: video.url,
            isTempFile: downloadResult.isTempFile,
            backend: downloadResult.backend,
        };
    },
};

export { savetubeDownload, ytmp3IngDownload, youtubeHtmlSearch, resolveVideoMeta };
