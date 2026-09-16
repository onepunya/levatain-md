import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../logger.js';
import { MAX_MEDIA_BYTES } from '../media/mediaLimit.js';
import { sleep, uniqueId } from '../utils.js';

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
        headers: { 'x-jaky-key': nextJakyKey() },
        signal: AbortSignal.timeout(30000)
    });
    const body = await res.json();
    if (!body || body.status !== true || !body.result?.downloadUrl) {
        throw new Error(`jaky info gagal: ${JSON.stringify(body).slice(0, 150)}`);
    }
    return body.result;
};

const downloadViaJaky = async (youtubeUrl, format, tempDir, id, onProgress) => {
    const quality = format === 'mp3' ? 128 : 720;
    const info = await jakyInfo(youtubeUrl, format, quality);
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const rawFile = path.join(tempDir, `${id}.raw.${ext}`);
    await streamDownload(info.downloadUrl, {}, rawFile, onProgress);
    await probeMedia(rawFile);
    return { rawFile, title: info.title, thumbnail: null };
};

const downloadWithRetry = async (youtubeUrl, format, tempDir, id, onProgress, attempts = 2) => {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await downloadViaJaky(youtubeUrl, format, tempDir, id, onProgress);
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
           
            fs.copyFileSync(rawFile, finalMp3);
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
