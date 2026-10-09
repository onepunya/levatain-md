import 'dotenv/config';

function required(name) {
    const val = process.env[name];
    if (!val) {
        console.error(`[config] ENV "${name}" wajib diisi tapi kosong. Cek file .env kamu (lihat .env.example).`);
        process.exit(1);
    }
    return val;
}

export const config = {
    bot: {
        name: 'Levatain-MD',
        link: process.env.BOT_LINK || 'https://levatain-wabot.edgeone.app/',
        thumb: process.env.BOT_THUMB || 'https://raw.githubusercontent.com/onepunya/animes/refs/heads/main/watermark-removed-47041.png',
    },

    pairingNumber: required('PAIRING_NUMBER').replace(/\D/g, ''),

    owner: {
        number: process.env.OWNER_NUMBER || '',
        lid: process.env.OWNER_LID ? process.env.OWNER_LID.replace(/\D/g, '') + '@lid' : null,
    },

    ai: {
        gemini: {
            cookie: process.env.GEMINI_COOKIE || '',
        },
    },

    /** Naga API key — dipakai HANYA untuk TTS voice note (bukan LLM) */
    tts: {
        nagaApiKey: process.env.NAGA_API_KEY || '',
    },

    onepunya: {
        apiKey: process.env.ONEPUNYA_API_KEY || '',
        baseUrl: (process.env.ONEPUNYA_BASE_URL || 'https://onepunya.qzz.io') + '/api',
    },

    giphy: {
        apiKey: process.env.GIPHY_API_KEY || '',
    },

    audd: {
        apiKey: process.env.AUDD_API_KEY || '',
    },

    shazam: {
        rapidApiKey: process.env.SHAZAM_RAPIDAPI_KEY || '',
        rapidApiHost: process.env.SHAZAM_RAPIDAPI_HOST || 'shazam-api6.p.rapidapi.com',
    },

    magicHour: {
        keys: [
            process.env.MAGICHOUR_KEY_1,
            process.env.MAGICHOUR_KEY_2,
            process.env.MAGICHOUR_KEY_3,
        ].filter(Boolean),
    },

    /** Crun.ai API — used for .musicgen / .songgen (Suno) */
    crun: {
        apiKey: process.env.CRUN_API_KEY || '',
    },

    songFinder: {
        baseUrl: (process.env.SONGFINDER_BASE_URL || 'https://freesongfinder.com').replace(/\/+$/, ''),
    },

    translateEmail: process.env.TRANSLATE_EMAIL || '',
    dashboardPort: Number(process.env.DASHBOARD_PORT) || 3000,
    debug: process.env.DEBUG === 'true',

    github: {
        token: process.env.GITHUB_TOKEN || '',
        repo:  process.env.GITHUB_REPO  || '',    
        path:  process.env.GITHUB_DB_PATH || 'database/db.json',
    },

    githubSync: {
        token:  process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || '',
        repo:   process.env.GITHUB_SYNC_REPO  || '',
        branch: process.env.GITHUB_SYNC_BRANCH || 'main',
    },
};


if (!config.ai.gemini.cookie) {
    console.warn('[config] Warning: GEMINI_COOKIE is empty, the AI chat feature will not work.');
}
