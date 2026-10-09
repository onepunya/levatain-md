import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config.js';

const stripThinking = (text) => {
	let out = String(text || '');
	out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
	const close = out.toLowerCase().lastIndexOf('</think>');
	if (close !== -1) out = out.slice(close + 8);
	out = out.replace(/<think>[\s\S]*$/i, '');
	return out.trim();
};

const LANG_NAMES = {
	id: 'Indonesian', en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
	es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian', ms: 'Malay', jv: 'Javanese',
	su: 'Sundanese', pt: 'Portuguese', it: 'Italian', hi: 'Hindi', th: 'Thai', vi: 'Vietnamese', tr: 'Turkish',
};
const langName = (code) => LANG_NAMES[String(code || '').toLowerCase()] || null;

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

	if (!config.ai.gemini.cookie) throw new Error("GEMINI_COOKIE is empty in .env");

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
	throw new Error("Failed to retrieve reply text");
};

const chatAI = (messages, system = '') => callGemini(messages, system);

export const llmApi = {
	chatAI,
	langName,

	translate: async (text, target = 'English') => {
		const system = `You are a professional translator. Translate the user's text into ${target}. Keep names, emojis, and formatting. Output only the translation, nothing else.`;
		return chatAI([{ role: 'user', content: String(text).slice(0, 4000) }], system);
	},

	intent: async (text, pluginList = [], history = [], userCtx = {}) => {
		const { isOwner, pushname, memoryStr, allUsersContext, hasSongMedia, lang = 'en' } = userCtx;
		const NL_EXCLUDE = new Set(['s', 'toimg', 'removebg', 'tourl', 'menu', 'ping', 'memory']);

		const cmdList = pluginList
			.filter(p => (p.tag !== 'owner' || isOwner) && !NL_EXCLUDE.has(p.cmd[0]))
			.map(p => {
				const example = p.ai?.examples?.[0];
				return `- ${p.cmd[0]}: ${p.ai?.trigger || p.desc}${example ? ` | format args example: "${example}" (args = bagian setelah command-nya, salin persis)` : ''}`;
			})
			.join('\n');

		const personality = isOwner ? PERSONALITY_OWNER : PERSONALITY_GENERAL;
		const ownerBlock = isOwner ? `\n${OWNER_BLOCK}\n` : '';
		const mediaBlock = hasSongMedia ? `\n[MEDIA] This user's message includes/replies to a ${hasSongMedia} file (it may contain a song). The system already has the file — you just can't listen to its contents directly.\n` : '';

		const userInfo = [
			`Nama: ${pushname || 'User'}`,
			`Status: ${isOwner ? 'Owner 👑' : 'User 👤'}`,
			memoryStr ? `Memory: ${memoryStr}` : '',
		].filter(Boolean).join(' | ');

		const langRule = (lang === 'id')
			? 'LANGUAGE: Balas user in Bahasa Indonesia. Intent/command routing tetap pahami input English maupun Indonesia.'
			: 'LANGUAGE: Reply to the user in English. Intent/command routing must still understand both English and Indonesian input.';

		const system = `${personality}\n${ownerBlock}${mediaBlock}\nUSER: ${userInfo}\n${langRule}\n${allUsersContext ? `${allUsersContext}\n` : ''}AVAILABLE COMMANDS:\n${cmdList || '(no commands registered)'}\n\nRULES:\n${RULES}\n${isOwner ? `${RULES_EXEC}\n` : ''}${hasSongMedia ? `${RULES_SONG_MEDIA}\n` : ''}${isOwner ? 'This user is the verified OWNER — highest priority service.\n' : ''}\n${JSON_SCHEMA}`;

		const messages = [...history.slice(-10), { role: 'user', content: text }];
		const response = await chatAI(messages, system);

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
