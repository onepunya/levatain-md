const BASE = 'https://boppy.me';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 6 * 60_000;

const HEADERS_BASE = {
    accept: '*/*',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    referer: `${BASE}/id/create`,
    'user-agent': UA,
};

export async function generateSong({ caption, lyrics, model = 'AceStep_1_5_XL_Turbo_INT8', duration = 120, bpm = 120, format = 'mp3' }, onProgress) {
    const genRes = await fetch(`${BASE}/api/generate`, {
        method: 'POST',
        headers: { ...HEADERS_BASE, 'content-type': 'application/json' },
        body: JSON.stringify({ caption, lyrics, model, duration, bpm, format }),
    });
    const genData = await genRes.json();
    if (!genRes.ok || !genData?.jobId) throw new Error(genData?.message || genData?.error || `Gagal mulai generate (HTTP ${genRes.status})`);

    const jobId = genData.jobId;
    const startedAt = Date.now();

    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT) throw new Error('Timeout nunggu hasil generate lagu.');
        await new Promise(r => setTimeout(r, POLL_INTERVAL));

        const jobRes = await fetch(`${BASE}/api/generate/jobs/${jobId}`, { headers: HEADERS_BASE });
        const job = await jobRes.json();

        if (job.status === 'failed' || job.status === 'error') {
            throw new Error(job.message || job.error || 'Generate lagu gagal di server.');
        }

        if (job.status === 'done') {
            const url = job.resultUrl || `${BASE}${job.audioUrl}`;
            return { url, audioUrl: job.audioUrl, coverUrl: job.coverUrl };
        }

        onProgress?.(job.progress ?? 0);
    }
}
