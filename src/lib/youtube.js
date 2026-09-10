import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger.js';
import { MAX_MEDIA_BYTES } from './mediaLimit.js';

export const MAX_FILE_SIZE = MAX_MEDIA_BYTES;

export const cleanupTempFile = file => {
    if (!file) return;
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const streamDownload = async (url, headers, outputFile, onProgress) => {
    const response = await axios.get(url, {
        headers,
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
        validateStatus: s => s >= 200 && s < 300
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
        response.data.destroy();
        throw new Error(`Sumber tidak valid (respons ${contentType || 'tidak diketahui'}, bukan file media)`);
    }

    const total = parseInt(response.headers['content-length'] || '0', 10);
    if (total > MAX_FILE_SIZE) {
        response.data.destroy();
        throw new Error(`File terlalu besar (${(total / 1024 / 1024).toFixed(1)}MB). Batas maksimal 15MB.`);
    }
    let loaded = 0;

    const writer = fs.createWriteStream(outputFile);
    response.data.on('data', chunk => {
        loaded += chunk.length;
        if (loaded > MAX_FILE_SIZE) {
            response.data.destroy();
            try { writer.destroy(); } catch {}
        } else if (onProgress && total > 0) {
            onProgress(Math.min(99, Math.round((loaded / total) * 100)));
        }
    });

    await new Promise((resolve, reject) => {
        response.data.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', () => {
            if (loaded > MAX_FILE_SIZE) {
                reject(new Error('File terlalu besar. Batas maksimal 15MB.'));
            } else {
                resolve();
            }
        });
        response.data.pipe(writer);
    });

    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
        throw new Error('Gagal download file: hasil kosong.');
    }
    return fs.statSync(outputFile).size;
};

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

const CLIPSSAVER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    Accept: '*/*',
    Origin: 'https://clipssaver.com'
};

const clipssaverInfo = async youtubeUrl => {
    const referer = `https://clipssaver.com/youtube-video-downloader/${encodeURIComponent(youtubeUrl)}`;
    const res = await axios.post(
        'https://clipssaver.com/api/youtube/info',
        { url: youtubeUrl },
        { headers: { ...CLIPSSAVER_HEADERS, Referer: referer, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!res.data?.success) throw new Error(`clipssaver info gagal: ${JSON.stringify(res.data).slice(0, 150)}`);
    return res.data;
};

const downloadViaClipssaver = async (youtubeUrl, format, tempDir, id, onProgress) => {
    const info = await clipssaverInfo(youtubeUrl);
    const type = format === 'mp3' ? 'audio' : 'video';
    const referer = `https://clipssaver.com/youtube-video-downloader/${encodeURIComponent(youtubeUrl)}`;
    const downloadUrl = `https://clipssaver.com/api/youtube/download?url=${encodeURIComponent(youtubeUrl)}&type=${type}`;

    const rawFile = path.join(tempDir, `${id}.raw.${format === 'mp3' ? 'mp3' : 'mp4'}`);
    await streamDownload(downloadUrl, { ...CLIPSSAVER_HEADERS, Referer: referer }, rawFile, onProgress);
    await probeMedia(rawFile);

    return { rawFile, title: info.title, thumbnail: info.thumbnail || info.cover };
};

const downloadWithRetry = async (youtubeUrl, format, tempDir, id, onProgress, attempts = 2) => {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await downloadViaClipssaver(youtubeUrl, format, tempDir, id, onProgress);
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
    const id = `yt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
