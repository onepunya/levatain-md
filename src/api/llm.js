import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { formatLocal, getTimezone } from '../runtime/scheduler.js';

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
const PROMPTS_DIR = path.join(__dirname, '..', 'ai', 'prompts');
const loadPrompt = (name) => fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim();
const PERSONALITY_OWNER = loadPrompt('personality-owner.txt');
const PERSONALITY_GENERAL = loadPrompt('personality-general.txt');
const OWNER_BLOCK = loadPrompt('owner-block.txt');
const RULES = loadPrompt('rules.txt');
const RULES_EXEC = loadPrompt('rules-exec.txt');
const RULES_TOOLS = loadPrompt('rules-tools.txt');
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

const scanObject = (str, start) => {
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < str.length; i++) {
        const ch = str[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return str.slice(start, i + 1);
        }
    }
    return null;
};

const parseModelJson = (str) => {
    const text = String(str || '');
    const starts = [...text.matchAll(/\{\s*"(?:command|tools)"\s*:/g)].map(m => m.index);
    let found = null;
    let skipUntil = 0;
    for (const start of starts) {
        if (start < skipUntil) continue;
        const raw = scanObject(text, start);
        if (!raw) continue;
        try {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
                found = obj;
                skipUntil = start + raw.length;
            }
        } catch {}
    }
    return found;
};

const looksLikeBrokenJson = (str) => /```json|\{\s*"(?:command|tools)"\s*:/i.test(String(str || ''));

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
        signal: AbortSignal.timeout(45_000),
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
            } catch {}
        }
    }

    if (finalAnswer) return stripThinking(finalAnswer);
    throw new Error("Failed to retrieve reply text");
};


const REFUSAL_RE = /^\W*(maaf[,.]?\s*)?((saya|aku|i)\s*(adalah|am|'m)\s*(hanya\s*|just\s*)?(sebuah\s*|a\s*)?(large\s*)?(model bahasa|language model)|saya tidak (dapat|bisa) membantu|i (can't|cannot|can not) help with that|i('m| am) unable to (help|assist)|i want to help as much as i can|my safety (system|filters?)|i can(?:'t|not) generate a response|(saya|aku) tidak (dapat|bisa) (membuat|menghasilkan) (respons|respon|jawaban)|sistem keamanan (saya|kami)|(maaf[,.]?\s*)?(saya|aku) tidak (dapat|bisa) memproses|tidak (diprogram|dirancang) untuk (itu|hal)|(saya|aku) hanya (menghasilkan teks|model bahasa)|i can(?:'t|not) (process|fulfill) (that|this) request)/i;
const isRefusal = (text) => {
    const t = String(text || '').trim();
    return t.length > 0 && t.length < 260 && REFUSAL_RE.test(t);
};

const callGeminiApi = async (messages, system) => {
    const { apiKey, model } = config.ai.gemini;
    if (!apiKey) throw new Error('GEMINI_API_KEY is empty in .env');
    const merged = [];
    for (const m of messages) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const text = String(m.content ?? '');
        const last = merged[merged.length - 1];
        if (last && last.role === role) last.parts[0].text += `\n\n${text}`;
        else merged.push({ role, parts: [{ text }] });
    }
    if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', parts: [{ text: '(start)' }] });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            contents: merged,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429) throw new Error('Rate limit tercapai.');
    if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text.trim()) {
        const err = new Error(data?.promptFeedback?.blockReason ? `Gemini API blocked: ${data.promptFeedback.blockReason}` : 'Gemini API returned an empty reply');
        if (data?.promptFeedback?.blockReason) err.refused = true;
        throw err;
    }
    return stripThinking(text);
};

const callProvider = async (messages, system) => {
    const { cookie, apiKey } = config.ai.gemini;
    if (cookie) {
        try {
            return await callGemini(messages, system);
        } catch (e) {
            if (!apiKey) throw e;
            console.warn(`[llm] cookie provider failed (${e.message}), falling back to Gemini API`);
        }
    }
    if (apiKey) return callGeminiApi(messages, system);
    throw new Error('No AI provider configured. Set GEMINI_COOKIE or GEMINI_API_KEY in .env');
};

const chatAI = async (messages, system = '') => {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
        last = await callProvider(messages, system);
        if (!isRefusal(last)) return last;
    }
    const err = new Error('AI refused to answer.');
    err.refused = true;
    throw err;
};

export const llmApi = {
    chatAI,
    langName,
    personality: PERSONALITY_GENERAL,

    translate: async (text, target = 'English') => {
        const system = `You are a professional translator. Translate the user's text into ${target}. Keep names, emojis, and formatting. Output only the translation, nothing else.`;
        return chatAI([{ role: 'user', content: String(text).slice(0, 4000) }], system);
    },

    summarizeChat: async (previous, messages) => {
        const transcript = messages
            .map(m => `${m.role === 'assistant' ? 'Bot' : 'User'}: ${String(m.content || '').slice(0, 500)}`)
            .join('\n')
            .slice(0, 9000);
        const system = 'You compress a WhatsApp chat into a compact memory for the assistant. Merge the previous summary with the new messages. Keep durable facts, decisions, ongoing tasks and the user\'s preferences; drop greetings and small talk. Same language as the chat. Plain text, max 900 characters, no markdown, no preamble.';
        const content = `Previous summary:\n${previous || '(none)'}\n\nNew messages:\n${transcript}\n\nUpdated summary:`;
        return chatAI([{ role: 'user', content }], system);
    },

    intent: async (text, pluginList = [], history = [], userCtx = {}, toolsPrompt = '', scratch = []) => {
        const { isOwner, pushname, memoryStr, summary, allUsersContext, lang = 'en' } = userCtx;
        const NL_EXCLUDE = new Set(['s', 'toimg', 'removebg', 'tourl', 'menu', 'ping', 'memory', 'ai', 'tanya', 'porn', 'bokep']);

        const agentNames = new Set(
            String(toolsPrompt || '')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('- '))
                .map(line => line.slice(2).split(':')[0].split(' ')[0].split('(')[0].trim())
                .filter(Boolean)
        );

        const cmdList = pluginList
            .filter(p => (p.tag !== 'owner' || isOwner) && !NL_EXCLUDE.has(p.cmd[0]) && !agentNames.has(p.cmd[0]))
            .map(p => {
                const example = p.ai?.examples?.[0];
                return `- ${p.cmd[0]}: ${p.ai?.trigger || p.desc}${example ? ` | format args example: "${example}" (args = bagian setelah command-nya, salin persis)` : ''}`;
            })
            .join('\n');

        const personality = isOwner ? PERSONALITY_OWNER : PERSONALITY_GENERAL;
        const ownerBlock = isOwner ? `\n${OWNER_BLOCK}\n` : '';

        const userInfo = [
            `Nama: ${pushname || 'User'}`,
            `Status: ${isOwner ? 'Owner 👑' : 'User 👤'}`,
            memoryStr ? `Memory: ${memoryStr}` : '',
        ].filter(Boolean).join(' | ');
        const nowLine = `NOW: ${formatLocal(Date.now(), getTimezone(), 'en')} (${getTimezone()})`;
        const summaryBlock = summary ? `EARLIER CONVERSATION SUMMARY (older than the recent messages): ${summary}\n` : '';

        const langRule = (lang === 'id')
            ? 'LANGUAGE: Balas user in Bahasa Indonesia. Intent/command routing tetap pahami input English maupun Indonesia.'
            : 'LANGUAGE: Reply to the user in English. Intent/command routing must still understand both English and Indonesian input.';

        const toolsBlock = toolsPrompt
            ? `\nAGENT TOOLS (workshop tools — pick one when the task needs it, prefer these over guessing):\n${toolsPrompt}\n`
            : '';

        const system = `${personality}\n${ownerBlock}\nUSER: ${userInfo}\n${nowLine}\n${summaryBlock}${langRule}\n${allUsersContext ? `${allUsersContext}\n` : ''}AVAILABLE COMMANDS:\n${cmdList || '(no commands registered)'}\n${toolsBlock}\nRULES:\n${RULES}\n${toolsPrompt ? `${RULES_TOOLS}\n` : ''}${isOwner ? `${RULES_EXEC}\n` : ''}${isOwner ? 'This user is the verified OWNER — highest priority service.\n' : ''}\n${JSON_SCHEMA}`;

        const messages = [...history.slice(-6), { role: 'user', content: text }, ...scratch];
        const response = await chatAI(messages, system);

        const plain = (message, extra = {}) => ({ command: 'chat', args: '', message, messages: [], tools: [], remember: {}, mood: null, voice: false, preReply: '', ...extra });

        const p = parseModelJson(response);
        if (!p) {
            if (looksLikeBrokenJson(response)) {
                return plain('⚠️ Respons AI rusak di tengah jalan. Coba kirim ulang pesannya ya.', { isError: true });
            }
            return plain(response.trim());
        }

        const parts = Array.isArray(p.messages)
            ? p.messages.map(x => String(x || '').trim()).filter(Boolean)
            : [];
        const tools = Array.isArray(p.tools)
            ? p.tools
                .filter(t => t && typeof t === 'object' && String(t.command || '').trim())
                .map(t => ({ command: String(t.command).trim(), args: stripMarkdownLinks(String(t.args ?? '')) }))
            : [];
        return {
            command: p.command || 'chat',
            args: stripMarkdownLinks(p.args || ''),
            message: p.message || '',
            messages: parts,
            tools,
            remember: p.remember || {},
            mood: p.mood || null,
            voice: p.voice === true,
            preReply: typeof p.preReply === 'string' ? p.preReply : '',
        };
    },
};
