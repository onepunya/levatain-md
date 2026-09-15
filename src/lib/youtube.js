import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger.js';
import { MAX_MEDIA_BYTES } from './mediaLimit.js';
import { sleep, uniqueId } from './utils.js';

export const MAX_FILE_SIZE = MAX_MEDIA_BYTES;

export const cleanupTempFile = file => {
    if (!file) return;
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
};

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
        inactivityTimer = setTimeout(() => activeReq?.destroy(new Error('Koneksi macet (timeout 120s tanpa data).')), 120000);
    };
    resetInactivity();

    const finish = error => {
        clearTimeout(inactivityTimer);
        error ? reject(error) : resolve();
    };

    activeReq = requestFollow(url, headers, 5, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
            res.destroy();
            return finish(new Error(`Sumber tidak valid (HTTP ${res.statusCode})`));
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            res.destroy();
            return finish(new Error(`Sumber tidak valid (respons ${contentType || 'tidak diketahui'}, bukan file media)`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        if (total > MAX_FILE_SIZE) {
            res.destroy();
            return finish(new Error(`File terlalu besar (${(total / 1024 / 1024).toFixed(1)}MB). Batas maksimal 15MB.`));
        }

        let loaded = 0;
        const writer = fs.createWriteStream(outputFile);

        res.on('data', chunk => {
            resetInactivity();
            loaded += chunk.length;
            if (loaded > MAX_FILE_SIZE) {
                res.destroy(new Error('File terlalu besar. Batas maksimal 15MB.'));
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
        throw new Error('Gagal download file: hasil kosong.');
    }
    return fs.statSync(outputFile).size;
});

const probeMedia = file => new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
        if (err) return reject(new Error('File hasil download rusak / bukan media valid.'));
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

const convertToMp3 = (inputFile, outputFile) => new Promise((resolve, reject) => {
    let stderrLog = '';
    ffmpeg(inputFile)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .format('mp3')
        .on('stderr', line => { stderrLog += line + '\n'; })
        .on('error', error => {
            logger.error(`[ffmpeg convertToMp3] ${error.message}\n${stderrLog.slice(-500)}`);
            reject(new Error('Gagal konversi ke MP3.'));
        })
        .on('end', () => resolve())
        .save(outputFile);
});

const muxAudioVideo = (videoFile, audioFile, outputFile) => new Promise((resolve, reject) => {
    let stderrLog = '';
    ffmpeg()
        .input(videoFile)
        .input(audioFile)
        .outputOptions(['-c:v copy', '-c:a aac', '-b:a 128k', '-movflags +faststart', '-shortest'])
        .format('mp4')
        .on('stderr', line => { stderrLog += line + '\n'; })
        .on('error', error => {
            logger.error(`[ffmpeg muxAudioVideo] ${error.message}\n${stderrLog.slice(-500)}`);
            reject(new Error('Gagal menggabungkan audio & video.'));
        })
        .on('end', () => resolve())
        .save(outputFile);
});

const YTULTRA_HEADERS = {
    accept: '*/*',
    'content-type': 'application/json',
    origin: 'https://www.ytultra.com',
    referer: 'https://www.ytultra.com/',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
};

const ytultraInfo = async youtubeUrl => {
    const res = await fetch('https://api.ytultra.com/ikool/youtube/download', {
        method: 'POST',
        headers: YTULTRA_HEADERS,
        body: JSON.stringify({ url: youtubeUrl }),
        signal: AbortSignal.timeout(30000)
    });
    const body = await res.json();
    if (!body || body.code !== '0000' || !body.data) {
        throw new Error(`ytultra info gagal: ${JSON.stringify(body).slice(0, 150)}`);
    }
    return body.data;
};

const withMediaMeta = (medias = []) => medias
    .filter(m => m?.url)
    .map(m => ({ ...m, fmt: (m.format || '').toLowerCase(), size: m.fileSize || 0 }));


const isProgressiveVideo = media => !/[?&]aitags=/.test(media.url || '');

const pickVideo = medias => {
    const videos = withMediaMeta(medias)
        .filter(m => m.fmt.includes('.mp4') && !m.fmt.includes('m4a'))
        .sort((a, b) => b.size - a.size);
    if (!videos.length) throw new Error('Video tidak ditemukan di respons ytultra.');
    return videos.find(v => v.size <= MAX_FILE_SIZE) || videos[videos.length - 1];
};

const pickAudio = medias => {
    const audio = withMediaMeta(medias)
        .filter(m => m.fmt.includes('.m4a') || m.fmt.includes('.weba') || m.fmt.includes('.mp3'))
        .sort((a, b) => b.size - a.size);
    if (!audio.length) return null;
    return audio.find(a => a.size <= MAX_FILE_SIZE) || audio[0];
};

const downloadViaYtultra = async (youtubeUrl, format, tempDir, id, onProgress) => {
    const info = await ytultraInfo(youtubeUrl);

    if (format === 'mp3') {
        const audio = pickAudio(info.medias);
        if (!audio) throw new Error('Audio tidak ditemukan di respons ytultra.');
        const ext = audio.fmt.includes('.weba') ? 'webm' : 'm4a';
        const rawFile = path.join(tempDir, `${id}.raw.${ext}`);
        await streamDownload(audio.url, YTULTRA_HEADERS, rawFile, onProgress);
        await probeMedia(rawFile);
        return { rawFile, title: info.title, thumbnail: info.imageUrl };
    }

    const video = pickVideo(info.medias);
    const videoFile = path.join(tempDir, `${id}.video.mp4`);

    if (isProgressiveVideo(video)) {
  
        await streamDownload(video.url, YTULTRA_HEADERS, videoFile, onProgress);
        await probeMedia(videoFile);
        return { rawFile: videoFile, title: info.title, thumbnail: info.imageUrl };
    }

    const audio = pickAudio(info.medias);
    await streamDownload(video.url, YTULTRA_HEADERS, videoFile, p => onProgress && onProgress(Math.round(p * 0.7)));
    await probeMedia(videoFile);

    if (!audio) {
        logger.warn('[yt] Tidak ada track audio terpisah, video dikirim tanpa suara.');
        return { rawFile: videoFile, title: info.title, thumbnail: info.imageUrl };
    }

    const audioExt = audio.fmt.includes('.weba') ? 'webm' : 'm4a';
    const audioFile = path.join(tempDir, `${id}.audio.${audioExt}`);
    await streamDownload(audio.url, YTULTRA_HEADERS, audioFile, p => onProgress && onProgress(70 + Math.round(p * 0.25)));
    await probeMedia(audioFile);

    const muxedFile = path.join(tempDir, `${id}.muxed.mp4`);
    try {
        await muxAudioVideo(videoFile, audioFile, muxedFile);
    } finally {
        cleanupTempFile(videoFile);
        cleanupTempFile(audioFile);
    }
    onProgress && onProgress(99);

    return { rawFile: muxedFile, title: info.title, thumbnail: info.imageUrl };
};

const downloadWithRetry = async (youtubeUrl, format, tempDir, id, onProgress, attempts = 2) => {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await downloadViaYtultra(youtubeUrl, format, tempDir, id, onProgress);
        } catch (error) {
            lastError = error;
            logger.warn(`[yt] percobaan ${i + 1}/${attempts} gagal: ${error.message}`);
            if (i < attempts - 1) await sleep(1500);
        }
    }
    throw lastError;
};

export const ytDownload = async (youtubeUrl, formatReq = 'mp4', onProgress) => {
    const format = formatReq === 'mp3' ? 'mp3' : 'mp4';
    const tempDir = os.tmpdir();
    const id = uniqueId('yt');
    const finalMp4 = path.join(tempDir, `${id}.mp4`);
    const finalMp3 = path.join(tempDir, `${id}.mp3`);

    let rawFile = null;

    try {
        const result = await downloadWithRetry(youtubeUrl, format, tempDir, id, onProgress);
        rawFile = result.rawFile;
        const { title, thumbnail } = result;

        if (format === 'mp3') {
            await convertToMp3(rawFile, finalMp3);
            cleanupTempFile(rawFile);

            if (!fs.existsSync(finalMp3) || fs.statSync(finalMp3).size <= 0) {
                throw new Error('File MP3 tidak berhasil dibuat.');
            }

            const size = fs.statSync(finalMp3).size;
            if (size > MAX_FILE_SIZE) {
                cleanupTempFile(finalMp3);
                throw new Error(`Ukuran file (${(size / 1024 / 1024).toFixed(1)}MB) melebihi batas 15MB.`);
            }

            return { title, thumbnail, format: 'mp3', url: finalMp3, size, isTempFile: true };
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
            throw new Error(`Ukuran file (${(size / 1024 / 1024).toFixed(1)}MB) melebihi batas 15MB.`);
        }

        return { title, thumbnail, format: 'mp4', url: finalMp4, size, isTempFile: true };

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
        const searchResult = await yts(query);
        const videos = searchResult.videos.slice(0, 5);
        if (!videos.length) throw new Error('Video tidak ditemukan.');

        return videos.map(v => ({
            title: v.title,
            url: v.url,
            timestamp: v.timestamp,
            views: v.views,
            author: v.author.name,
            thumbnail: v.thumbnail
        }));
    },

    play: async (query, onProgress) => {
        const searchResult = await yts(query);
        const video = searchResult.videos[0];
        if (!video) throw new Error('Lagu tidak ditemukan.');

        const downloadResult = await ytDownload(video.url, 'mp3', onProgress);

        return {
            title: video.title,
            channel: video.author.name,
            duration: video.timestamp,
            thumbnail: video.thumbnail,
            url: downloadResult.url,
            size: downloadResult.size,
            sourceVideo: video.url,
            isTempFile: downloadResult.isTempFile
        };
    }
};
