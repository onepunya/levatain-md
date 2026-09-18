import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import { uniqueId, sleep } from '../utils.js';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

export const ONEPUNYA_BASE = config.onepunya.baseUrl;
export const ONEPUNYA_KEY = config.onepunya.apiKey;

const ONEPUNYA_HDR = {
	'Content-Type': 'application/json',
	'x-api-key': ONEPUNYA_KEY
};

const RETRY_MSGS = ['DATABASE_NOT_READY', 'Server failed to provide download link.'];

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

export const onepost = async (path, body, retries = 4, delay = 3000) => {
	for (let i = 0; i < retries; i++) {
		let textData;
		try {
			textData = await curlRequest('POST', `${ONEPUNYA_BASE}${path}`, ONEPUNYA_HDR, body);
		} catch (e) {
			throw new Error(`Request to ONEPUNYA failed: ${e.message}`);
		}

		let data;
		try {
			data = JSON.parse(textData);
		} catch (e) {
			logger.error(`[onepost] API did not respond with JSON. Server response: ${textData.substring(0, 100)}...`);
			throw new Error('The API server responded with HTML, likely blocked by a security system.');
		}

		if (!data.status && RETRY_MSGS.includes(data.message)) {
			if (i < retries - 1) await sleep(delay);
			continue;
		}
		return data;
	}
	throw new Error('ONEPUNYA API did not respond after several attempts.');
};

export const oneget = async (path, params = {}, retries = 3, delay = 2000) => {
	for (let i = 0; i < retries; i++) {
		const q = new URLSearchParams({ ...params, apikey: ONEPUNYA_KEY }).toString();

		let textData;
		try {
			textData = await curlRequest('GET', `${ONEPUNYA_BASE}${path}?${q}`, ONEPUNYA_HDR);
		} catch (e) {
			throw new Error(`Request to ONEPUNYA failed: ${e.message}`);
		}

		let data;
		try {
			data = JSON.parse(textData);
		} catch (e) {
			logger.error(`[oneget] API did not respond with JSON. Server response: ${textData.substring(0, 100)}...`);
			throw new Error('The API server responded with HTML, likely blocked by a security system.');
		}

		if (data.message === 'DATABASE_NOT_READY') {
			if (i < retries - 1) await sleep(delay);
			continue;
		}
		return data;
	}
	throw new Error('DATABASE_NOT_READY: ONEPUNYA API is not ready yet.');
};
