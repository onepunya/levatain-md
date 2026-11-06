import 'dotenv/config';

function required(name) {
    const val = process.env[name];
    if (!val) {
        console.error(`[config] ENV "${name}" wajib diisi tapi kosong. Cek file .env kamu (lihat .env.example).`);
        process.exit(1);
    }
    return val;
}

function resolveDashboardPort() {
    const candidates = [
        ['DASHBOARD_PORT', process.env.DASHBOARD_PORT],
        ['SERVER_PORT', process.env.SERVER_PORT],
        ['PORT', process.env.PORT],
    ];
    for (const [source, raw] of candidates) {
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        const n = Number(String(raw).trim());
        if (Number.isFinite(n) && n > 0 && n <= 65535) {
            resolveDashboardPort._source = source;
            return Math.floor(n);
        }
    }
    resolveDashboardPort._source = 'default';
    return 3000;
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
            apiKey: process.env.GEMINI_API_KEY || '',
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        },
    },

    agent: {
        maxSteps: Math.max(1, Number(process.env.AGENT_MAX_STEPS) || 8),
        timeoutMs: Math.max(10_000, Number(process.env.AGENT_TIMEOUT_MS) || 120_000),
        maxStepsUser: Math.max(1, Number(process.env.AGENT_MAX_STEPS_USER) || 4),
        timeoutMsUser: Math.max(10_000, Number(process.env.AGENT_TIMEOUT_MS_USER) || 60_000),
        userStepsPerHour: Math.max(0, Number(process.env.AGENT_USER_STEPS_PER_HOUR) || 40),
        maxParallel: Math.min(6, Math.max(1, Number(process.env.AGENT_MAX_PARALLEL) || 4)),
    },

    timezone: process.env.BOT_TIMEZONE || 'Asia/Jakarta',

    tts: {
        nagaApiKey: process.env.NAGA_API_KEY || '',
    },

    giphy: {
        apiKey: process.env.GIPHY_API_KEY || '',
    },



    magicHour: {
        keys: [
            process.env.MAGICHOUR_KEY_1,
            process.env.MAGICHOUR_KEY_2,
            process.env.MAGICHOUR_KEY_3,
        ].filter(Boolean),
    },



    translateEmail: process.env.TRANSLATE_EMAIL || '',
    dashboardPort: resolveDashboardPort(),
    dashboardPortSource: null,
    debug: process.env.DEBUG === 'true',

    github: {
        token: process.env.GITHUB_TOKEN || '',
        repo: process.env.GITHUB_REPO || '',
        path: process.env.GITHUB_DB_PATH || 'database/db.json',
    },

    githubSync: {
        token: process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || '',
        repo: process.env.GITHUB_SYNC_REPO || '',
        branch: process.env.GITHUB_SYNC_BRANCH || 'main',
    },
};

config.dashboardPortSource = resolveDashboardPort._source || 'default';

if (!config.ai.gemini.cookie && !config.ai.gemini.apiKey) {
    console.warn('[config] Warning: GEMINI_COOKIE and GEMINI_API_KEY are both empty, the AI chat feature will not work.');
}
