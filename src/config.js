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
        naga: {
            apiKey: process.env.NAGA_API_KEY || '',
            model: process.env.NAGA_MODEL || 'nemotron-3-ultra-550b-a55b:free',
        },
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

    translateEmail: process.env.TRANSLATE_EMAIL || '',
    dashboardPort: Number(process.env.DASHBOARD_PORT) || 3000,
    debug: process.env.DEBUG === 'true',
};

if (!config.ai.gemini.cookie && !config.ai.naga.apiKey) {
    console.warn('[config] Peringatan: GEMINI_COOKIE dan NAGA_API_KEY kosong semua, fitur AI chat tidak akan berfungsi.');
} else if (!config.ai.gemini.cookie) {
    console.warn('[config] Peringatan: GEMINI_COOKIE kosong, AI chat langsung fallback ke Naga.');
}
