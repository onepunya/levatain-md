import { logger } from '../logger.js';
import { config } from '../../config.js';
import { sleep, uploadToUrl } from '../utils.js';
import { curlRequest, curlMultipart, curlMultipartFile, onepost, oneget } from './http.js';
import { ytHandler } from './youtube.js';

global.yt = ytHandler;

const FLUX_BASE_URL = 'https://www.techgrapple.com';
const FLUX_HEADERS = {
	'accept': '*/*',
	'origin': FLUX_BASE_URL,
	'referer': `${FLUX_BASE_URL}/online-tools/free-ai-text-to-image-generation-with-flux-1-1/`,
	'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};

const fluxRetry = async (fn, max = 2) => {
	try {
		return await fn();
	} catch (e) {
		if (max <= 0) throw e;
		await sleep(2000);
		return fluxRetry(fn, max - 1);
	}
};

const generateFlux = (prompt) => fluxRetry(async () => {
	const rawGen = await curlMultipart(`${FLUX_BASE_URL}/flux-image/generate`, FLUX_HEADERS, {
		model: 'schnell',
		prompt,
		width: '1024',
		height: '768',
		guidance: '0.0',
		seed_type: 'random',
		seed_value: '',
	});
	logger.debug(`[flux:generate] → ${rawGen.slice(0, 300)}`);

	let data;
	try {
		data = JSON.parse(rawGen);
	} catch {
		throw new Error(`GENERATE_NOT_JSON: ${rawGen.slice(0, 150)}`);
	}
	if (!data.task_id) throw new Error(`NO_TASK_ID: ${JSON.stringify(data).slice(0, 150)}`);
	const taskId = data.task_id;

	for (let i = 0; i < 20; i++) {
		await sleep(2000 + Math.random() * 1000);

		const rawStatus = await curlRequest('GET', `${FLUX_BASE_URL}/flux-image/status/${taskId}`, FLUX_HEADERS);
		logger.debug(`[flux:status ${i}] → ${rawStatus.slice(0, 200)}`);

		let result;
		try {
			result = JSON.parse(rawStatus);
		} catch {
			throw new Error(`STATUS_NOT_JSON: ${rawStatus.slice(0, 150)}`);
		}

		if (result.status === 'done') {
			if (!result.image) throw new Error(`NO_IMAGE_FIELD: ${JSON.stringify(result).slice(0, 150)}`);
			return result.image;
		}
		if (result.status === 'failed') throw new Error(`GENERATION_FAILED: ${JSON.stringify(result).slice(0, 150)}`);
	}
	throw new Error('TIMEOUT: task did not complete after 20x polling');
});

const recognizeSongShazam = async (buffer) => {
	if (!config.shazam.rapidApiKey) return { skipped: true };

	const stdout = await curlMultipartFile(
		`https://${config.shazam.rapidApiHost}/shazam/recognize/`, {
			'x-rapidapi-key': config.shazam.rapidApiKey,
			'x-rapidapi-host': config.shazam.rapidApiHost,
		}, {},
		'upload_file',
		buffer,
		'clip.mp3'
	);

	let data;
	try {
		data = JSON.parse(stdout);
	} catch {
		throw new Error('Response invalid (cek SHAZAM_RAPIDAPI_KEY / kuota RapidAPI)');
	}

	if (data.message || data.error) throw new Error(data.message || data.error);

	const track = data.track || data.result?.matches?.[0]?.track || data.matches?.[0]?.track || data.result?.track || data.result || data;
	const title = track?.title || track?.name || '';
	const artist = track?.subtitle || track?.artist || '';

	if (!title) {
		logger.warn(`recognizeSong: Shazam no-match, raw response: ${stdout.slice(0, 500)}`);
		return null;
	}

	return {
		title,
		artist,
		album: track?.sections?.[0]?.metadata?.find?.(m => m.title === 'Album')?.text || '',
		spotify: null,
		source: 'kode S',
	};
};

const recognizeSongAudd = async (buffer) => {
	if (!config.audd.apiKey) return { skipped: true };

	const stdout = await curlMultipartFile(
		'https://api.audd.io/', {}, { api_token: config.audd.apiKey, return: 'spotify' },
		'file',
		buffer,
		'clip.mp3'
	);

	let data;
	try {
		data = JSON.parse(stdout);
	} catch {
		throw new Error('Response invalid');
	}

	if (data.status !== 'success') throw new Error(data.error?.error_message || 'AudD API error');
	if (!data.result) return null;

	return {
		title: data.result.title || '',
		artist: data.result.artist || '',
		album: data.result.album || '',
		spotify: data.result.spotify?.external_urls?.spotify || null,
		source: 'kode A',
	};
};

export const mediaApi = {
	imagine: async (prompt) => {
		let txtz = prompt;
		try {
			const email = config.translateEmail ? `&de=${config.translateEmail}` : '';
			const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(prompt)}&langpair=id|en${email}`;
			const raw = await curlRequest('GET', url, {});
			const data = JSON.parse(raw);
			if (data?.responseData?.translatedText) txtz = data.responseData.translatedText;
		} catch (e) {
			logger.warn(`[imagine] Translate failed, using original prompt: ${e.message}`);
		}

		const base64 = await generateFlux(txtz);
		const buffer = Buffer.from(base64, 'base64');
		if (buffer.length < 1000) throw new Error('Gambar hasil generate invalid.');
		return buffer;
	},

	ytdl: async (url, format = 'mp4', onProgress) => await ytHandler.download(url, format, onProgress),
	youtube: async (query) => await ytHandler.search(query),
	ytplay: async (query, onProgress) => await ytHandler.play(query, onProgress),

	tiktok: async (url) => {
		const data = await onepost('/download/tiktok', { url, format: 'mp4' });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Failed to download TikTok.');
	},

	douyin: async (url) => {
		const data = await onepost('/download/douyin', { url });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Failed to download Douyin.');
	},

	instagram: async (url) => {
		const data = await onepost('/download/insta', { url });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Failed to download Instagram.');
	},

	facebook: async (url) => {
		const { default: axios } = await import('axios');
		const m = url.match(/https?:\/\/(www\.)?(facebook\.com\/(?:share\/[rv]\/|watch\/?\?v=|reel\/|.*\/videos\/)|fb\.watch\/)\S+/i) || url.match(/https?:\/\/(www\.)?(facebook\.com|fb\.watch)\/\S+/i);
		if (!m) throw new Error('URL Facebook invalid. Gunakan link video/reel.');
		const cleanUrl = m[0].trim();

		const { data } = await axios.post('https://getfvid.com/downloader', new URLSearchParams({ url: cleanUrl }), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
			},
			timeout: 25000,
		});

		const { load } = await import('cheerio');
		const $ = load(data);
		const title = $('span.content b').first().text().trim() || 'Facebook Video';
		const hdLink = $('a:contains("Download HD")').attr('href') || $('a:contains("Download in HD")').attr('href');
		const sdLink = $('a:contains("Download Normal")').attr('href') || $('a:contains("Download in SD")').attr('href');
		const media = hdLink || sdLink;
		if (!media) throw new Error('Failed to mengambil video Facebook. Pastikan link publik & berupa video/reel.');
		return { media, title, quality: hdLink ? 'HD' : 'SD' };
	},

	threads: async (url) => {
		const { default: axios } = await import('axios');
		if (!/threads\.(net|com)/i.test(url)) throw new Error('URL Threads invalid. Gunakan link post Threads yang publik.');

		const page = await axios.get('https://threadsmate.com/', {
			headers: {
				'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
				'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
			},
			timeout: 20000,
		});

		const { load } = await import('cheerio');
		const $page = load(page.data);
		const targetInput = $page('form.form-inline input[type="hidden"]').not('[name="lang"]').first();
		const tokenName = targetInput.attr('name');
		const tokenValue = targetInput.val();
		const cookies = (page.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
		if (!tokenName) throw new Error('Failed to generate token sesi Threads.');

		const params = new URLSearchParams();
		params.append('url', url.trim());
		params.append(tokenName, tokenValue);
		params.append('lang', 'en');

		const { data } = await axios.post('https://threadsmate.com/download', params, {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': cookies,
				'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
			},
			timeout: 25000,
		});

		const $ = load(data);
		const medias = [];
		$('a[href*="download"]').each((_, el) => {
			const href = $(el).attr('href');
			if (href && /^https?:\/\//.test(href)) medias.push(href);
		});
		if (!medias.length) throw new Error('Failed to mengambil media Threads. Pastikan link publik.');
		return { media: medias };
	},

	capcut: async (url) => {
		const { default: axios } = await import('axios');
		const m = url.match(/https?:\/\/(www\.)?(capcut\.com)\/\S+/i);
		if (!m) throw new Error('URL CapCut invalid.');
		const cleanUrl = m[0].trim();

		const { data } = await axios.post('https://3bic.com/api/download', { url: cleanUrl }, {
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
				'Referer': 'https://3bic.com/id',
			},
			timeout: 25000,
		});

		if (!data || data.code !== 200) throw new Error('Failed to mengambil data CapCut. Pastikan URL benar & publik.');
		const media = data.originalVideoUrl ? `https://3bic.com${data.originalVideoUrl}` : data.video_url;
		if (!media) throw new Error('Video CapCut not found.');
		return { media, title: data.title || '-', author: data.authorName || '-' };
	},

	removebg: async (imageUrl) => {
		const data = await onepost('/ai-image/removebg', { image: imageUrl });
		if (data.status && data.result) {
			const r = data.result;
			return typeof r === 'string' ? r : (r.url || r.output || r.image || r.result);
		}
		throw new Error(data.message || 'Failed to remove background.');
	},

	tourl: async (buffer, mimetype = 'image/jpeg') => uploadToUrl(buffer, mimetype),

	recognizeSong: async (buffer) => {
		if (!config.shazam.rapidApiKey && !config.audd.apiKey) {
			throw new Error('No API key set for song recognition (set SHAZAM_RAPIDAPI_KEY or AUDD_API_KEY in .env)');
		}

		const errors = [];

		try {
			const shazamResult = await recognizeSongShazam(buffer);
			if (shazamResult?.skipped) {
				logger.debug('recognizeSong: Shazam skipped (SHAZAM_RAPIDAPI_KEY empty)');
			} else if (shazamResult) {
				logger.info(`recognizeSong: Shazam ketemu "${shazamResult.artist} - ${shazamResult.title}"`);
				return shazamResult;
			} else {
				logger.warn('recognizeSong: Shazam gak nemu match, fallback ke AudD');
			}
		} catch (e) {
			logger.warn(`recognizeSong: Shazam error -> ${e.message}`);
			errors.push(`Shazam: ${e.message}`);
		}

		try {
			const auddResult = await recognizeSongAudd(buffer);
			if (auddResult?.skipped) {
				logger.debug('recognizeSong: AudD skipped (AUDD_API_KEY empty)');
			} else if (auddResult) {
				logger.info(`recognizeSong: AudD ketemu "${auddResult.artist} - ${auddResult.title}"`);
				return auddResult;
			} else {
				logger.warn('recognizeSong: AudD juga gak nemu match');
			}
		} catch (e) {
			logger.warn(`recognizeSong: AudD error -> ${e.message}`);
			errors.push(`AudD: ${e.message}`);
		}

		if (errors.length === 2) throw new Error(errors.join(' | '));
		return null;
	},

	lyrics: async (query) => {
		const data = await oneget('/search/lyrics', { q: query });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Lirik not found.');
	},

	github: async (query) => {
		const data = await oneget('/search/github', { q: query });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'GitHub search failed.');
	},

	pixiv: async (query) => {
		const data = await oneget('/search/pixiv', { q: query });
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Pixiv search failed.');
	},
};
