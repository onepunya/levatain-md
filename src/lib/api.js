import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	fileURLToPath
} from 'url';
import {
	logger
} from './logger.js';
import {
	uploadToUrl
} from './utils.js';
import {
	execFile
} from 'child_process';
import {
	promisify
} from 'util';
import {
	ytHandler
} from './youtube.js';
import {
	config
} from '../config.js';
global.yt = ytHandler

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, '..', 'ai', 'prompts');
const loadPrompt = (name) => fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim();
const PERSONALITY_OWNER = loadPrompt('personality-owner.txt');
const PERSONALITY_GENERAL = loadPrompt('personality-general.txt');
const OWNER_BLOCK = loadPrompt('owner-block.txt');
const RULES = loadPrompt('rules.txt');
const RULES_EXEC = loadPrompt('rules-exec.txt');
const RULES_SONG_MEDIA = loadPrompt('rules-song-media.txt');
const JSON_SCHEMA = loadPrompt('json-schema.txt');

const extractJson = (str) => {
	const start = str.indexOf('{');
	if (start === -1) return null;
	let depth = 0,
		inString = false,
		escape = false;
	for (let i = start; i < str.length; i++) {
		const ch = str[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (ch === '\\') {
			escape = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return str.slice(start, i + 1);
		}
	}
	return null;
};

const ONEPUNYA_BASE = config.onepunya.baseUrl;
const ONEPUNYA_KEY = config.onepunya.apiKey;

const ONEPUNYA_HDR = {
	'Content-Type': 'application/json',
	'x-api-key': ONEPUNYA_KEY
};

const RETRY_MSGS = ['DATABASE_NOT_READY', 'Server failed to provide download link.'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const curlRequest = async (method, url, headers, body) => {
	const args = ['-s', '--max-time', '60', '-X', method];
	for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
	if (body !== undefined) args.push('--data', JSON.stringify(body));
	args.push(url);
	const {
		stdout
	} = await execFileAsync('curl', args, {
		maxBuffer: 1024 * 1024 * 20
	});
	return stdout;
};

const curlMultipart = async (url, headers, fields) => {
	const args = ['-s', '--max-time', '60', '-X', 'POST'];
	for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
	for (const [k, v] of Object.entries(fields)) args.push('--form-string', `${k}=${v}`);
	args.push(url);
	const {
		stdout
	} = await execFileAsync('curl', args, {
		maxBuffer: 1024 * 1024 * 20
	});
	return stdout;
};

const curlMultipartFile = async (url, headers, fields, fileField, fileBuffer, filename = 'file.mp3') => {
	const tempPath = path.join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
			({
				stdout
			} = await execFileAsync('curl', args, {
				maxBuffer: 1024 * 1024 * 20
			}));
		} catch (e) {
			logger.error(`curlMultipartFile ${url} gagal jalan: ${e.message}`);
			throw new Error(`curl gagal: ${e.message}`);
		}

		const idx = stdout.lastIndexOf(MARKER);
		const status = idx >= 0 ? parseInt(stdout.slice(idx + MARKER.length).trim(), 10) : 0;
		const body = idx >= 0 ? stdout.slice(0, idx) : stdout;

		logger.debug(`curlMultipartFile ${url} -> HTTP ${status}, body: ${body.slice(0, 300)}`);

		if (status && (status < 200 || status >= 300)) {
			throw new Error(`HTTP ${status}: ${body.slice(0, 200) || '(body kosong)'}`);
		}
		if (!body || !body.trim()) {
			throw new Error(`Response kosong dari ${url} (HTTP ${status || 'unknown'})`);
		}

		return body;
	} finally {
		try {
			fs.unlinkSync(tempPath);
		} catch {}
	}
};

const onepost = async (path, body, retries = 4, delay = 3000) => {
	for (let i = 0; i < retries; i++) {
		let textData;
		try {
			textData = await curlRequest('POST', `${ONEPUNYA_BASE}${path}`, ONEPUNYA_HDR, body);
		} catch (e) {
			throw new Error(`Request ke ONEPUNYA gagal: ${e.message}`);
		}

		let data;
		try {
			data = JSON.parse(textData);
		} catch (e) {
			logger.error(`[onepost] API tidak membalas JSON. Balasan server: ${textData.substring(0, 100)}...`);
			throw new Error('Server API merespons dengan HTML, kemungkinan diblokir sistem keamanan.');
		}

		if (!data.status && RETRY_MSGS.includes(data.message)) {
			if (i < retries - 1) await sleep(delay);
			continue;
		}
		return data;
	}
	throw new Error('ONEPUNYA API tidak merespons setelah beberapa percobaan.');
};

const oneget = async (path, params = {}, retries = 3, delay = 2000) => {
	for (let i = 0; i < retries; i++) {
		const q = new URLSearchParams({
			...params,
			apikey: ONEPUNYA_KEY
		}).toString();

		let textData;
		try {
			textData = await curlRequest('GET', `${ONEPUNYA_BASE}${path}?${q}`, ONEPUNYA_HDR);
		} catch (e) {
			throw new Error(`Request ke ONEPUNYA gagal: ${e.message}`);
		}

		let data;
		try {
			data = JSON.parse(textData);
		} catch (e) {
			logger.error(`[oneget] API tidak membalas JSON. Balasan server: ${textData.substring(0, 100)}...`);
			throw new Error('Server API merespons dengan HTML, kemungkinan diblokir sistem keamanan.');
		}

		if (data.message === 'DATABASE_NOT_READY') {
			if (i < retries - 1) await sleep(delay);
			continue;
		}
		return data;
	}
	throw new Error('DATABASE_NOT_READY: ONEPUNYA API belum siap.');
};

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
	throw new Error('TIMEOUT: task tidak selesai setelah 20x polling');
});

const GROQ_KEYS = config.ai.groqKeys;

let _groqIdx = 0;
const getGroqKey = () => GROQ_KEYS[_groqIdx % GROQ_KEYS.length];
const rotateGroq = () => {
	_groqIdx = (_groqIdx + 1) % Math.max(GROQ_KEYS.length, 1);
	logger.warn(`[Groq] Key exhausted → rotate ke index ${_groqIdx}`);
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const NAGA_KEY = config.ai.naga.apiKey;
const NAGA_URL = 'https://api.naga.ac/v1/chat/completions';
const NAGA_TTS_URL = 'https://api.naga.ac/v1/audio/speech';

const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

const _callLLM = async (messages, system = '', model = 'qwen/qwen3.6-27b') => {
	const payload = {
		model,
		temperature: 0.7,
		max_tokens: 600,
		messages: [
			...(system ? [{
				role: 'system',
				content: system
			}] : []),
			...messages,
		],
		...(model.startsWith('qwen/') ? {
			reasoning_effort: 'none'
		} : {}),
	};

	if (GROQ_KEYS.length > 0) {
		let lastError;
		let modelInvalid = false;

		for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
			try {
				const res = await fetch(GROQ_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${getGroqKey()}`
					},
					body: JSON.stringify(payload),
				});
				const data = await res.json();
				const errMsg = data.error?.message || '';

				if (data.error?.code === 'model_not_found' || errMsg.includes('does not exist')) {
					lastError = `Model Groq "${model}" tidak valid/deprecated: ${errMsg}`;
					modelInvalid = true;
					break;
				}

				if (
					res.status === 429 || res.status === 402 ||
					data.error?.code === 'rate_limit_exceeded' ||
					data.error?.code === 'insufficient_quota' ||
					errMsg.includes('rate_limit') || errMsg.includes('quota') || errMsg.includes('Rate limit')
				) {
					lastError = errMsg || `Key ${attempt} exhausted`;
					rotateGroq();
					continue;
				}

				if (data.choices?.[0]?.message?.content)
					return stripThinking(data.choices[0].message.content);

				throw new Error(data.error?.message || 'Groq response kosong');
			} catch (e) {
				lastError = e.message;
				rotateGroq();
			}
		}

		if (modelInvalid) logger.warn(`[Groq] ${lastError}. Fallback ke Naga...`);
		else logger.warn(`[Groq] Semua key exhausted (${lastError}). Fallback ke Naga...`);
	}

	if (!NAGA_KEY) throw new Error('Tidak ada AI key tersedia (Groq dan Naga kosong di .env)');

	const nagaPayload = {
		...payload,
		model: config.ai.naga.model
	};
	const res = await fetch(NAGA_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${NAGA_KEY}`
		},
		body: JSON.stringify(nagaPayload),
	});
	const data = await res.json();
	if (data.choices?.[0]?.message?.content) return stripThinking(data.choices[0].message.content);
	throw new Error(data.error?.message || 'Naga response kosong');
};

const recognizeSongShazam = async (buffer) => {
	if (!config.shazam.rapidApiKey) return {
		skipped: true
	};

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
		throw new Error('Response tidak valid (cek SHAZAM_RAPIDAPI_KEY / kuota RapidAPI)');
	}

	if (data.message || data.error) {
		throw new Error(data.message || data.error);
	}

	const track = data.track ||
		data.result?.matches?.[0]?.track ||
		data.matches?.[0]?.track ||
		data.result?.track ||
		data.result ||
		data;
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
	if (!config.audd.apiKey) return {
		skipped: true
	};

	const stdout = await curlMultipartFile(
		'https://api.audd.io/', {}, {
			api_token: config.audd.apiKey,
			return: 'spotify'
		},
		'file',
		buffer,
		'clip.mp3'
	);

	let data;
	try {
		data = JSON.parse(stdout);
	} catch {
		throw new Error('Response tidak valid');
	}

	if (data.status !== 'success') {
		throw new Error(data.error?.error_message || 'AudD API error');
	}
	if (!data.result) return null;

	return {
		title: data.result.title || '',
		artist: data.result.artist || '',
		album: data.result.album || '',
		spotify: data.result.spotify?.external_urls?.spotify || null,
		source: 'kode A',
	};
};

export const api = {

	groq: (messages, system = '', model = 'qwen/qwen3.6-27b') =>
		_callLLM(messages, system, model),

	naga: async (messages, system = '', model = null) => {
		if (!NAGA_KEY) throw new Error('NAGA_API_KEY tidak diset di .env');
		const res = await fetch(NAGA_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${NAGA_KEY}`
			},
			body: JSON.stringify({
				model: model || config.ai.naga.model || 'step-3.5-flash:free',
				temperature: 0.7,
				max_tokens: 600,
				messages: [...(system ? [{
					role: 'system',
					content: system
				}] : []), ...messages],
			}),
		});
		const data = await res.json();
		if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
		throw new Error(data.error?.message || 'Naga response kosong');
	},

	ai: async (query, model = 'chatgpt') => {
		const data = await onepost('/ai-chat/generation', {
			model,
			stream: false,
			markdown: false,
			messages: [{
				role: 'user',
				content: query
			}],
		});
		if (data.status && data.result) return data.result.response;
		throw new Error('ONEPUNYA AI error atau response kosong.');
	},

	intent: async (text, pluginList = [], history = [], userCtx = {}) => {
		const {
			isOwner,
			pushname,
			memoryStr,
			allUsersContext,
			hasSongMedia
		} = userCtx;

		const NL_EXCLUDE = new Set(['s', 'toimg', 'removebg', 'tourl', 'menu', 'ping', 'memory']);

		const cmdList = pluginList
			.filter(p => (p.tag !== 'owner' || isOwner) && !NL_EXCLUDE.has(p.cmd[0]))
			.map(p => `- ${p.cmd[0]}: ${p.ai?.trigger || p.desc}`)
			.join('\n');

		const personality = isOwner ? PERSONALITY_OWNER : PERSONALITY_GENERAL;

		const ownerBlock = isOwner ? `\n${OWNER_BLOCK}\n` : '';

		const mediaBlock = hasSongMedia ?
			`\n[MEDIA] Pesan user ini menyertakan/reply file ${hasSongMedia} (kemungkinan ada lagu di dalamnya). Sistem SUDAH PUNYA file-nya, kamu cuma nggak bisa dengerin isinya.\n` :
			'';

		const userInfo = [
			`Nama: ${pushname || 'User'}`,
			`Status: ${isOwner ? 'Owner 👑' : 'User 👤'}`,
			memoryStr ? `Memory: ${memoryStr}` : '',
		].filter(Boolean).join(' | ');

		const system = `${personality}
${ownerBlock}${mediaBlock}
USER: ${userInfo}
${allUsersContext ? `${allUsersContext}\n` : ''}COMMAND TERSEDIA:
${cmdList || '(tidak ada command terdaftar)'}

ATURAN:
${RULES}
${isOwner ? `${RULES_EXEC}\n` : ''}${hasSongMedia ? `${RULES_SONG_MEDIA}\n` : ''}${isOwner ? 'User ini OWNER terverifikasi sistem — layani loyalitas tertinggi.\n' : ''}
${JSON_SCHEMA}`;

		const messages = [...history.slice(-10), {
			role: 'user',
			content: text
		}];
		const response = await _callLLM(messages, system, 'qwen/qwen3.6-27b');

		const jsonStr = extractJson(response);
		if (!jsonStr) return {
			command: 'chat',
			args: '',
			message: response.trim(),
			remember: {},
			mood: null,
			voice: false,
			preReply: ''
		};
		try {
			const p = JSON.parse(jsonStr);
			return {
				command: p.command || 'chat',
				args: p.args || '',
				message: p.message || '',
				remember: p.remember || {},
				mood: p.mood || null,
				voice: p.voice === true,
				preReply: typeof p.preReply === 'string' ? p.preReply : '',
			};
		} catch {
			return {
				command: 'chat',
				args: '',
				message: response.trim(),
				remember: {},
				mood: null,
				voice: false,
				preReply: ''
			};
		}
	},

	imagine: async (prompt) => {
		let txtz = prompt;
		try {
			const email = config.translateEmail ? `&de=${config.translateEmail}` : '';
			const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(prompt)}&langpair=id|en${email}`;
			const raw = await curlRequest('GET', url, {});
			const data = JSON.parse(raw);
			if (data?.responseData?.translatedText) txtz = data.responseData.translatedText;
		} catch (e) {
			logger.warn(`[imagine] Translate gagal, pakai prompt asli: ${e.message}`);
		}

		const base64 = await generateFlux(txtz);
		const buffer = Buffer.from(base64, 'base64');
		if (buffer.length < 1000) throw new Error('Gambar hasil generate tidak valid.');
		return buffer;
	},

	tts: async (text, voice = 'id-ID-GadisNeural') => {
		const data = await onepost('/ai-voice/tts-generation', {
			text,
			voice
		});
		if (data.status && data.result) {
			const r = data.result;
			return typeof r === 'string' ? r : (r.url || r.audio || r.output);
		}
		throw new Error(data.message || 'Gagal generate TTS.');
	},

	nagaTTS: async (text, voice = 'Shimmer', model = 'eleven-multilingual-v2:free') => {
		if (!NAGA_KEY) throw new Error('NAGA_API_KEY tidak diset di .env');
		if (!text || !text.trim()) throw new Error('Teks TTS kosong.');
		const innya = getDynamicInstructions(text)

		let res;
		try {
			res = await fetch(NAGA_TTS_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${NAGA_KEY}`
				},
				body: JSON.stringify({
					model,
					voice,
					input: text,
					instructions: innya,
					speed: 1.0
				}),
			});
		} catch (e) {
			throw new Error(`Naga TTS tidak bisa diakses: ${e.message}`);
		}

		const contentType = res.headers.get('content-type') || '';


		if (!res.ok || contentType.includes('application/json') || contentType.includes('text/')) {
			let msg = `Naga TTS error: HTTP ${res.status}`;
			try {
				const data = await res.json();
				msg = data.error?.message || data.message || msg;
			} catch {
				try {
					msg = (await res.text()).slice(0, 200) || msg;
				} catch {}
			}
			throw new Error(msg);
		}

		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length < 100) throw new Error('Naga TTS mengembalikan audio kosong/tidak valid.');
		return buffer;
	},


	elevenlabs: async (text, voice = 'bella', pitch = 0, speed = 0.9) => {
		if (!text || !text.trim()) throw new Error('Teks TTS kosong.');
		const url = `https://api.termai.cc/api/text2speech/elevenlabs?text=${encodeURIComponent(text)}&voice=${voice}&pitch=${pitch}&speed=${speed}&key=Bell409`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length < 100) throw new Error('ElevenLabs mengembalikan audio kosong/tidak valid.');
		return buffer;
	},


	generateVoiceNote: async (text, voice = 'Shimmer') => {
		try {
			return await api.nagaTTS(text, voice);
		} catch (e) {
			logger.warn(`[tts] Naga gagal (${e.message}), fallback ke ElevenLabs...`);
			return await api.elevenlabs(text);
		}
	},
	ytdl: async (url, format = 'mp4', onProgress) => await ytHandler.download(url, format, onProgress),

	youtube: async (query) => await ytHandler.search(query),

	ytplay: async (query, onProgress) => await ytHandler.play(query, onProgress),

	tiktok: async (url) => {
		const data = await onepost('/download/tiktok', {
			url,
			format: 'mp4'
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Gagal download TikTok.');
	},

	douyin: async (url) => {
		const data = await onepost('/download/douyin', {
			url
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Gagal download Douyin.');
	},

	instagram: async (url) => {
		const data = await onepost('/download/insta', {
			url
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Gagal download Instagram.');
	},

	facebook: async (url) => {
		const {
			default: axios
		} = await import('axios');
		const m = url.match(/https?:\/\/(www\.)?(facebook\.com\/(?:share\/[rv]\/|watch\/?\?v=|reel\/|.*\/videos\/)|fb\.watch\/)\S+/i) ||
			url.match(/https?:\/\/(www\.)?(facebook\.com|fb\.watch)\/\S+/i);
		if (!m) throw new Error('URL Facebook tidak valid. Gunakan link video/reel.');
		const cleanUrl = m[0].trim();

		const {
			data
		} = await axios.post('https://getfvid.com/downloader', new URLSearchParams({
			url: cleanUrl
		}), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
			},
			timeout: 25000,
		});

		const {
			load
		} = await import('cheerio');
		const $ = load(data);
		const title = $('span.content b').first().text().trim() || 'Facebook Video';
		const hdLink = $('a:contains("Download HD")').attr('href') || $('a:contains("Download in HD")').attr('href');
		const sdLink = $('a:contains("Download Normal")').attr('href') || $('a:contains("Download in SD")').attr('href');
		const media = hdLink || sdLink;
		if (!media) throw new Error('Gagal mengambil video Facebook. Pastikan link publik & berupa video/reel.');
		return {
			media,
			title,
			quality: hdLink ? 'HD' : 'SD'
		};
	},

	threads: async (url) => {
		const {
			default: axios
		} = await import('axios');
		if (!/threads\.(net|com)\//i.test(url)) throw new Error('URL Threads tidak valid.');

		const page = await axios.get('https://threadsmate.com/', {
			headers: {
				'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
				'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
			},
			timeout: 20000,
		});

		const {
			load
		} = await import('cheerio');
		const $page = load(page.data);
		const targetInput = $page('form.form-inline input[type="hidden"]').not('[name="lang"]').first();
		const tokenName = targetInput.attr('name');
		const tokenValue = targetInput.val();
		const cookies = (page.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
		if (!tokenName) throw new Error('Gagal generate token sesi Threads.');

		const params = new URLSearchParams();
		params.append('url', url.trim());
		params.append(tokenName, tokenValue);
		params.append('lang', 'en');

		const {
			data
		} = await axios.post('https://threadsmate.com/download', params, {
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
			if (href && /^https?:\/\//i.test(href)) medias.push(href);
		});
		if (!medias.length) throw new Error('Gagal mengambil media Threads. Pastikan link publik.');
		return {
			media: medias
		};
	},

	capcut: async (url) => {
		const {
			default: axios
		} = await import('axios');
		const m = url.match(/https?:\/\/(www\.)?(capcut\.com)\/\S+/i);
		if (!m) throw new Error('URL CapCut tidak valid.');
		const cleanUrl = m[0].trim();

		const {
			data
		} = await axios.post('https://3bic.com/api/download', {
			url: cleanUrl
		}, {
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
				'Referer': 'https://3bic.com/id',
			},
			timeout: 25000,
		});

		if (!data || data.code !== 200) throw new Error('Gagal mengambil data CapCut. Pastikan URL benar & publik.');
		const media = data.originalVideoUrl ? `https://3bic.com${data.originalVideoUrl}` : data.video_url;
		if (!media) throw new Error('Video CapCut tidak ditemukan.');
		return {
			media,
			title: data.title || '-',
			author: data.authorName || '-'
		};
	},

	removebg: async (imageUrl) => {
		const data = await onepost('/ai-image/removebg', {
			image: imageUrl
		});
		if (data.status && data.result) {
			const r = data.result;
			return typeof r === 'string' ? r : (r.url || r.output || r.image || r.result);
		}
		throw new Error(data.message || 'Gagal remove background.');
	},

	tourl: async (buffer, mimetype = 'image/jpeg') => {
		const {
			uploadToUrl
		} = await import('./utils.js');
		return uploadToUrl(buffer, mimetype);
	},

	recognizeSong: async (buffer) => {
		if (!config.shazam.rapidApiKey && !config.audd.apiKey) {
			throw new Error('Belum ada API key buat kenali lagu (isi SHAZAM_RAPIDAPI_KEY atau AUDD_API_KEY di .env)');
		}

		const errors = [];

		try {
			const shazamResult = await recognizeSongShazam(buffer);
			if (shazamResult?.skipped) {
				logger.debug('recognizeSong: Shazam dilewati (SHAZAM_RAPIDAPI_KEY kosong)');
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
				logger.debug('recognizeSong: AudD dilewati (AUDD_API_KEY kosong)');
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
		const data = await oneget('/search/lyrics', {
			q: query
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Lirik tidak ditemukan.');
	},

	github: async (query) => {
		const data = await oneget('/search/github', {
			q: query
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'GitHub search gagal.');
	},

	pixiv: async (query) => {
		const data = await oneget('/search/pixiv', {
			q: query
		});
		if (data.status && data.result) return data.result;
		throw new Error(data.message || 'Pixiv search gagal.');
	},
};

function getDynamicInstructions(text) {
	if (text.endsWith("?") || text.includes("?")) {
		return "Speak with an inquisitive, helpful, and curious tone.";
	} else if (text.includes("!") || text.toLowerCase().includes("hore")) {
		return "Speak with high energy and excitement.";
	} else if (text.toLowerCase().includes("maaf") || text.toLowerCase().includes("sayang")) {
		return "Speak with a soft, empathetic, and gentle tone.";
	}
	return "Speak in a natural, clear, and neutral conversational tone.";
}