import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import { config } from '../../config.js';
import { onepost } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');
const loadPrompt = (name) => fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim();
const PERSONALITY_OWNER = loadPrompt('personality-owner.txt');
const PERSONALITY_GENERAL = loadPrompt('personality-general.txt');
const OWNER_BLOCK = loadPrompt('owner-block.txt');
const RULES = loadPrompt('rules.txt');
const RULES_EXEC = loadPrompt('rules-exec.txt');
const RULES_SONG_MEDIA = loadPrompt('rules-song-media.txt');
const JSON_SCHEMA = loadPrompt('json-schema.txt');

const stripMarkdownLinks = (str) => {
	if (typeof str !== 'string' || !str.includes('](')) return str;
	return str.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '$2').trim();
};

const extractJson = (str) => {
	const start = str.indexOf('{');
	if (start === -1) return null;
	let depth = 0, inString = false, escape = false;
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

const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

const buildMessages = (system, messages) => [
	...(system ? [{ role: 'system', content: system }] : []),
	...messages,
];

const callGemini = async (messages, system) => {
	let promptText = system ? `[SYSTEM INSTRUCTIONS]:\n${system}\n\n` : '';
	messages.forEach(m => {
		promptText += `[${m.role.toUpperCase()}]: ${m.content}\n`;
	});
	promptText += "\n[ASSISTANT]:";

	const url = new URL("https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate");
	url.searchParams.append("bl", "boq_assistant-bard-web-server_20260912.08_p0");
	url.searchParams.append("f.sid", "-4966488158871472830");
	url.searchParams.append("hl", "id");
	url.searchParams.append("_reqid", "2266864");
	url.searchParams.append("rt", "c");

	const rawData = [
		null,
		JSON.stringify([
			[promptText, 0, null, null, null, null, 0],
			["id"],
			["", "", "", null, null, null, null, null, null, ""]
		])
	];

	const body = new URLSearchParams();
	body.append("f.req", JSON.stringify(rawData));

	const headers = {
		"authority": "gemini.google.com",
		"accept": "*/*",
		"accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
		"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
		"origin": "https://gemini.google.com",
		"referer": "https://gemini.google.com/",
		"user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
		"x-same-domain": "1",
		"cookie": config.ai.gemini.cookie
	};

	if (!config.ai.gemini.cookie) throw new Error("GEMINI_COOKIE kosong di .env");

	const res = await fetch(url, {
		method: 'POST',
		headers: headers,
		body: body,
	});

	if (res.status === 429 || res.status === 402) throw new Error("Rate limit tercapai.");
	if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

	const rawText = await res.text();
	let finalAnswer = "";
	const lines = rawText.split('\n');

	for (const line of lines) {
		if (line.startsWith('[[') && line.includes('"wrb.fr"')) {
			try {
				const parsedLine = JSON.parse(line);
				const wrbData = parsedLine[0];
				if (wrbData && typeof wrbData[2] === 'string') {
					const innerData = JSON.parse(wrbData[2]);
					if (innerData?.[4]?.[0]?.[1]?.[0]) {
						finalAnswer = innerData[4][0][1][0];
					}
				}
			} catch (e) {}
		}
	}

	if (finalAnswer) return stripThinking(finalAnswer);
	throw new Error("Gagal mengambil teks balasan");
};

const NAGA_KEY = config.ai.naga.apiKey;
const NAGA_URL = 'https://api.naga.ac/v1/chat/completions';

const callNaga = async (messages, system) => {
	if (!NAGA_KEY) throw new Error('Tidak ada AI key tersedia (Gemini dan Naga kosong di .env)');

	const payload = {
		model: config.ai.naga.model,
		temperature: 0.7,
		max_tokens: 600,
		messages: buildMessages(system, messages),
	};
	const res = await fetch(NAGA_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${NAGA_KEY}`
		},
		body: JSON.stringify(payload),
	});
	const data = await res.json();
	if (data.choices?.[0]?.message?.content) return stripThinking(data.choices[0].message.content);
	throw new Error(data.error?.message || 'Naga response kosong');
};

const _callLLM = async (messages, system = '') => {
	try {
		return await callGemini(messages, system);
	} catch (e) {
		logger.warn(`[Gemini] ${e.message}. Fallback ke Naga...`);
		return await callNaga(messages, system);
	}
};

export const llmApi = {
	chatAI: (messages, system = '') => _callLLM(messages, system),

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
				messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
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
			messages: [{ role: 'user', content: query }],
		});
		if (data.status && data.result) return data.result.response;
		throw new Error('ONEPUNYA AI error atau response kosong.');
	},

	intent: async (text, pluginList = [], history = [], userCtx = {}) => {
		const { isOwner, pushname, memoryStr, allUsersContext, hasSongMedia } = userCtx;
		const NL_EXCLUDE = new Set(['s', 'toimg', 'removebg', 'tourl', 'menu', 'ping', 'memory']);

		const cmdList = pluginList
			.filter(p => (p.tag !== 'owner' || isOwner) && !NL_EXCLUDE.has(p.cmd[0]))
			.map(p => {
				const example = p.ai?.examples?.[0];
				return `- ${p.cmd[0]}: ${p.ai?.trigger || p.desc}${example ? ` | format args contoh: "${example}" (args = bagian setelah command-nya, salin persis)` : ''}`;
			})
			.join('\n');

		const personality = isOwner ? PERSONALITY_OWNER : PERSONALITY_GENERAL;
		const ownerBlock = isOwner ? `\n${OWNER_BLOCK}\n` : '';
		const mediaBlock = hasSongMedia ? `\n[MEDIA] Pesan user ini menyertakan/reply file ${hasSongMedia} (kemungkinan ada lagu di dalamnya). Sistem SUDAH PUNYA file-nya, kamu cuma nggak bisa dengerin isinya.\n` : '';

		const userInfo = [
			`Nama: ${pushname || 'User'}`,
			`Status: ${isOwner ? 'Owner 👑' : 'User 👤'}`,
			memoryStr ? `Memory: ${memoryStr}` : '',
		].filter(Boolean).join(' | ');

		const system = `${personality}\n${ownerBlock}${mediaBlock}\nUSER: ${userInfo}\n${allUsersContext ? `${allUsersContext}\n` : ''}COMMAND TERSEDIA:\n${cmdList || '(tidak ada command terdaftar)'}\n\nATURAN:\n${RULES}\n${isOwner ? `${RULES_EXEC}\n` : ''}${hasSongMedia ? `${RULES_SONG_MEDIA}\n` : ''}${isOwner ? 'User ini OWNER terverifikasi sistem — layani loyalitas tertinggi.\n' : ''}\n${JSON_SCHEMA}`;

		const messages = [...history.slice(-10), { role: 'user', content: text }];
		const response = await _callLLM(messages, system);

		const jsonStr = extractJson(response);
		if (!jsonStr) return { command: 'chat', args: '', message: response.trim(), remember: {}, mood: null, voice: false, preReply: '' };
		try {
			const p = JSON.parse(jsonStr);
			return {
				command: p.command || 'chat',
				args: stripMarkdownLinks(p.args || ''),
				message: p.message || '',
				remember: p.remember || {},
				mood: p.mood || null,
				voice: p.voice === true,
				preReply: typeof p.preReply === 'string' ? p.preReply : '',
			};
		} catch {
			return { command: 'chat', args: '', message: response.trim(), remember: {}, mood: null, voice: false, preReply: '' };
		}
	},
};

export { NAGA_KEY, NAGA_URL };
