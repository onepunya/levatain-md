import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../util/logger.js';
import { uniqueId } from '../util/utils.js';

const execFileAsync = promisify(execFile);

export const curlRequest = async (method, url, headers, body) => {
    const args = ['-s', '--max-time', '60', '-X', method];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    if (body !== undefined) args.push('--data', JSON.stringify(body));
    args.push(url);
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 20 });
    return stdout;
};

export const curlMultipart = async (url, headers, fields) => {
    const args = ['-s', '--max-time', '60', '-X', 'POST'];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    for (const [k, v] of Object.entries(fields)) args.push('--form-string', `${k}=${v}`);
    args.push(url);
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 20 });
    return stdout;
};

export const curlMultipartFile = async (url, headers, fields, fileField, fileBuffer, filename = 'file.mp3') => {
    const tempPath = path.join(os.tmpdir(), uniqueId('upload'));
    fs.writeFileSync(tempPath, fileBuffer);
    const MARKER = '__HTTP_STATUS__:';
    try {
        const args = ['-s', '--max-time', '30', '-X', 'POST', '-w', `\n${MARKER}%{http_code}`];
        for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
        for (const [k, v] of Object.entries(fields)) args.push('-F', `${k}=${v}`);
        args.push('-F', `${fileField}=@${tempPath};filename=${filename}`);
        args.push(url);

        let stdout;
        try {
            ({ stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 20 }));
        } catch (e) {
            logger.error(`curlMultipartFile ${url} failed to run: ${e.message}`);
            throw new Error(`curl failed: ${e.message}`);
        }

        const idx = stdout.lastIndexOf(MARKER);
        const status = idx >= 0 ? parseInt(stdout.slice(idx + MARKER.length).trim(), 10) : 0;
        const body = idx >= 0 ? stdout.slice(0, idx) : stdout;

        logger.debug(`curlMultipartFile ${url} -> HTTP ${status}, body: ${body.slice(0, 300)}`);

        if (status && (status < 200 || status >= 300)) throw new Error(`HTTP ${status}: ${body.slice(0, 200) || '(empty body)'}`);
        if (!body || !body.trim()) throw new Error(`Empty response from ${url} (HTTP ${status || 'unknown'})`);

        return body;
    } finally {
        try {
            fs.unlinkSync(tempPath);
        } catch {}
    }
};
