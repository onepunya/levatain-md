import { logger } from '../logger.js';
import { onepost } from './http.js';
import { NAGA_KEY } from './llm.js';

const NAGA_TTS_URL = 'https://api.naga.ac/v1/audio/speech';

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

export const voiceApi = {
	tts: async (text, voice = 'id-ID-GadisNeural') => {
		const data = await onepost('/ai-voice/tts-generation', { text, voice });
		if (data.status && data.result) {
			const r = data.result;
			return typeof r === 'string' ? r : (r.url || r.audio || r.output);
		}
		throw new Error(data.message || 'Failed to generate TTS.');
	},

	nagaTTS: async (text, voice = 'Shimmer', model = 'eleven-multilingual-v2:free') => {
		if (!NAGA_KEY) throw new Error('NAGA_API_KEY is not set in .env');
		if (!text || !text.trim()) throw new Error('TTS text is empty.');
		const innya = getDynamicInstructions(text);

		let res;
		try {
			res = await fetch(NAGA_TTS_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${NAGA_KEY}`
				},
				body: JSON.stringify({ model, voice, input: text, instructions: innya, speed: 1.0 }),
			});
		} catch (e) {
			throw new Error(`Naga TTS is unreachable: ${e.message}`);
		}

		const contentType = res.headers.get('content-type') || '';

		if (!res.ok || contentType.includes('application/json') || contentType.includes('text/')) {
			let msg = `Naga TTS error: HTTP ${res.status}`;
			try {
				const data = await res.json();
				msg = data.error?.message || data.message || msg;
			} catch {
				try { msg = (await res.text()).slice(0, 200) || msg; } catch {}
			}
			throw new Error(msg);
		}

		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length < 100) throw new Error('Naga TTS returned empty/invalid audio.');
		return buffer;
	},

	elevenlabs: async (text, voice = 'bella', pitch = 0, speed = 0.9) => {
		if (!text || !text.trim()) throw new Error('TTS text is empty.');
		const url = `https://api.termai.cc/api/text2speech/elevenlabs?text=${encodeURIComponent(text)}&voice=${voice}&pitch=${pitch}&speed=${speed}&key=Bell409`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length < 100) throw new Error('ElevenLabs returned empty/invalid audio.');
		return buffer;
	},

	generateVoiceNote: async (text, voice = 'Shimmer') => {
		try {
			return await voiceApi.nagaTTS(text, voice);
		} catch (e) {
			logger.warn(`[tts] Naga failed (${e.message}), falling back to ElevenLabs...`);
			return await voiceApi.elevenlabs(text);
		}
	},
};
