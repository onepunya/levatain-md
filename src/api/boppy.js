import { sleep } from '../util/utils.js';
import { config } from '../config.js';

const BASE = 'https://api.crun.ai';
const CREATE_PATH = '/api/v1/client/job/CreateTask';
const INFO_PATH = '/api/v1/client/job/TaskInfo';
const POLL_INTERVAL = 15_000;
const POLL_TIMEOUT = 8 * 60_000;
const DEFAULT_MODEL = 'v5';

function apiKey() {
	const key = config.crun?.apiKey || process.env.CRUN_API_KEY || '';
	if (!key) throw new Error('CRUN_API_KEY is not set. Add it to .env (get one at https://crun.ai/user-api-key).');
	return key;
}

function headers() {
	return {
		'Content-Type': 'application/json',
		'x-api-key': apiKey(),
		Accept: 'application/json',
	};
}

function makeTitle(lyrics, caption) {
	const fromLyrics = String(lyrics || '')
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	if (fromLyrics.length >= 3) return fromLyrics;
	const fromCaption = String(caption || '').trim().slice(0, 80);
	return fromCaption || 'AI Song';
}

/**
 * Generate a song via Crun.ai Suno API (custom mode with lyrics + style tags).
 * Signature kept compatible with the old boppy generateSong:
 *   generateSong({ caption, lyrics }, onProgress?) → { url, urls, tracks, taskId }
 */
export async function generateSong(
	{
		caption = '',
		lyrics = '',
		title,
		model = DEFAULT_MODEL,
		instrumental = false,
		vocal_gender,
	} = {},
	onProgress
) {
	const tags = String(caption || '').trim();
	const lyricText = String(lyrics || '').trim();

	if (!instrumental && !lyricText) {
		throw new Error('Lyrics are required when instrumental is false.');
	}
	if (!tags) {
		throw new Error('Music style/prompt (tags) is required.');
	}

	const input = {
		mode: 'custom',
		model,
		instrumental: Boolean(instrumental),
		title: (title || makeTitle(lyricText, tags)).slice(0, 100),
		tags: tags.slice(0, 1000),
	};

	if (!input.instrumental) {
		input.lyrics = lyricText.slice(0, 5000);
	}
	if (vocal_gender === 'm' || vocal_gender === 'f') {
		input.vocal_gender = vocal_gender;
	}

	const createRes = await fetch(`${BASE}${CREATE_PATH}`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({
			model: 'suno/music-generate',
			input,
		}),
	});

	const createJson = await createRes.json().catch(() => ({}));
	if (!createRes.ok || createJson?.code !== 200 || !createJson?.data?.task_id) {
		const msg =
			createJson?.message ||
			(Array.isArray(createJson?.errors) ? createJson.errors.join('; ') : null) ||
			`Failed to create song task (HTTP ${createRes.status})`;
		throw new Error(msg);
	}

	const taskId = createJson.data.task_id;
	const startedAt = Date.now();
	let ticks = 0;

	while (true) {
		if (Date.now() - startedAt > POLL_TIMEOUT) {
			throw new Error('Timeout waiting for song generation.');
		}
		await sleep(POLL_INTERVAL);
		ticks++;

		const approx = Math.min(95, Math.round((ticks / (POLL_TIMEOUT / POLL_INTERVAL)) * 100));
		onProgress?.(approx);

		const infoRes = await fetch(
			`${BASE}${INFO_PATH}?task_id=${encodeURIComponent(taskId)}`,
			{ headers: headers() }
		);
		const infoJson = await infoRes.json().catch(() => ({}));

		if (infoRes.status === 404 || infoJson?.code === 404) {
			throw new Error('Song task not found.');
		}
		if (!infoRes.ok && infoJson?.code && infoJson.code !== 200) {
			throw new Error(infoJson.message || `Task query failed (HTTP ${infoRes.status})`);
		}

		const data = infoJson?.data;
		if (!data) continue;

		const status = data.status;

		if (status === 'failed') {
			const errMsg =
				data.result?.message ||
				infoJson.message ||
				'Song generation failed on the server.';
			throw new Error(errMsg);
		}

		if (status === 'success') {
			onProgress?.(100);

			const tracks = Array.isArray(data.result?.suno_data)
				? data.result.suno_data
				: [];
			const mediaUrls = Array.isArray(data.result?.media_urls)
				? data.result.media_urls.filter(Boolean)
				: [];

			const urlsFromTracks = tracks
				.map((t) => t.suno_audio_url)
				.filter(Boolean);
			const urls = [...new Set([...urlsFromTracks, ...mediaUrls])];

			if (!urls.length) {
				throw new Error('Generation succeeded but no audio URL was returned.');
			}

			return {
				url: urls[0],
				urls,
				tracks,
				taskId,
				title: tracks[0]?.title || input.title,
				coverUrl: tracks[0]?.suno_image_url || tracks[0]?.suno_image_large_url || null,
			};
		}
	}
}
