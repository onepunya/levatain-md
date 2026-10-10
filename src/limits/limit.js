import { ProgressMessage } from '../wa/progress.js';

const RESET_MS = 3 * 60 * 60 * 1000;

export const PLANS = {
    free:        { max: 100,  days: 0,  price: 0,     label: 'Free' },
    registered:  { max: 200,  days: 0,  price: 0,     label: 'Registered' },
    basic:       { max: 300,  days: 7,  price: 5000,  label: 'Basic' },
    pro:         { max: 500,  days: 16, price: 10000, label: 'Pro' },
    max:         { max: 1000, days: 30, price: 20000, label: 'Max' },
};

const FEATURE_COST = {
    default:     1.0,
    chat:        1.5,
    imagine:     4.0,
    editimage:   3.5,
    musicgen:    6.0,
    upscale:     3.0,
    removebg:    2.5,
    sticker:     1.2,
    toimg:       1.2,
    tourl:       1.0,
    youtube:     2.0,
    ytmp3:       2.0,
    ytmp4:       2.5,
    ytv:         2.5,
    ytvideo:     2.5,
    play:        2.5,
    songfinder:  2.0,
    findsong:    2.0,
    tiktok:      1.8,
    instagram:   1.8,
    facebook:    1.8,
    twitter:     1.8,
    pinterest:   2.0,
    threads:     1.8,
    capcut:      2.2,
    snackvideo:  1.8,
    porndl:      3.0,
    nightcore:   1.5,
    bassboost:   1.5,
    vaporwave:   1.5,
    slowedreverb:1.5,
    reverb:      1.5,
    echo:        1.5,
    reverse:     1.5,
    robot:       1.5,
    chipmunk:    1.5,
    deepvoice:   1.5,
    slowmo:      1.5,
    speedup:     1.5,
    '8d':        1.5,
    gempa:       0.5,
    rvo:         1.0,
    ttprofile:   1.5,
    impostor:    2.0,
    pesawat:     2.0,
    tembak:      1.5,
    runner:      1.5,
    tod:         1.0,
    pilihacak:   0.8,
    emoticon:    1.0,
    cekhodam:    1.5,
    khodam:      1.5,
    mykhodam:    1.5,
    roast:       1.5,
    roasting:    1.5,
};

const BAR_LEN = 14;

function renderBattery(pct) {
    const filled = Math.max(0, Math.min(BAR_LEN, Math.round((pct / 100) * BAR_LEN)));
    const empty = BAR_LEN - filled;
    let color = '🟢';
    if (pct <= 15) color = '🔴';
    else if (pct <= 40) color = '🟡';
    else if (pct <= 70) color = '🟠';
    return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function formatDuration(ms) {
    if (ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function getPlanMax(user) {
    const now = Date.now();
    if (user.plan && user.plan !== 'free' && user.plan !== 'registered') {
        if (user.planExpiry && user.planExpiry > now) {
            return PLANS[user.plan]?.max || 100;
        }
        user.plan = user.registered ? 'registered' : 'free';
        user.planExpiry = 0;
    }
    if (user.registered) return PLANS.registered.max;
    return PLANS.free.max;
}

export function ensureLimitState(user) {
    if (typeof user.limitUsed !== 'number') user.limitUsed = 0;
    if (typeof user.lastLimitReset !== 'number') user.lastLimitReset = 0;
    if (!user.plan) user.plan = user.registered ? 'registered' : 'free';
    if (typeof user.planExpiry !== 'number') user.planExpiry = 0;
    if (typeof user.registered !== 'boolean') user.registered = false;

    const now = Date.now();
    if (!user.lastLimitReset || now - user.lastLimitReset >= RESET_MS) {
        user.limitUsed = 0;
        user.lastLimitReset = now;
    }
    return user;
}

export function getLimitInfo(user) {
    ensureLimitState(user);
    const max = getPlanMax(user);
    const used = Math.min(user.limitUsed, max);
    const remain = Math.max(0, +(max - used).toFixed(2));
    const pctRemain = max > 0 ? +((remain / max) * 100).toFixed(1) : 0;
    const pctUsed = max > 0 ? +((used / max) * 100).toFixed(1) : 0;
    const nextReset = user.lastLimitReset + RESET_MS;
    const untilReset = Math.max(0, nextReset - Date.now());
    const planKey = user.plan || 'free';
    const planMeta = PLANS[planKey] || PLANS.free;
    let planLeft = 0;
    if (user.planExpiry && user.planExpiry > Date.now()) {
        planLeft = user.planExpiry - Date.now();
    }
    return {
        max,
        used: +used.toFixed(2),
        remain,
        pctRemain,
        pctUsed,
        nextReset,
        untilReset,
        plan: planKey,
        planLabel: planMeta.label,
        planExpiry: user.planExpiry || 0,
        planLeft,
        registered: !!user.registered,
    };
}

export function getFeatureCost(cmd = '') {
    const key = String(cmd || '').toLowerCase().replace(/^\./, '');
    return FEATURE_COST[key] ?? FEATURE_COST.default;
}

export function canUse(user, cost) {
    ensureLimitState(user);
    const max = getPlanMax(user);
    return user.limitUsed + cost <= max + 0.001;
}

export function consumeLimit(user, cost) {
    ensureLimitState(user);
    user.limitUsed = +(user.limitUsed + cost).toFixed(2);
    return getLimitInfo(user);
}

export async function checkAndConsume(user, cmd, isOwner = false) {
    const cost = getFeatureCost(cmd);
    ensureLimitState(user);
    if (!isOwner && !canUse(user, cost)) {
        return { ok: false, info: getLimitInfo(user), cost };
    }
    const info = consumeLimit(user, cost);
    return { ok: true, info, cost };
}

export function buildLimitCard(info, name = 'User') {
    const bar = renderBattery(info.pctRemain);
    const planLine = info.planLeft > 0
        ? `📦 Plan *${info.planLabel}* · left ${formatDuration(info.planLeft)}`
        : `📦 Plan *${info.planLabel}*`;
    const reg = info.registered ? '✅ Registered' : '❌ Not registered';
    return [
        `⚡ *Limit Status* — ${name}`,
        '',
        bar + ` *${info.pctRemain}%*`,
        `📊 Used: *${info.used}* / *${info.max}*`,
        `♻️ Resets in: *${formatDuration(info.untilReset)}*`,
        planLine,
        `🪪 ${reg}`,
        '',
        '_Limit resets automatically every 3 hours_',
    ].join('\n');
}

export async function animateLimitBar(sock, jid, info, quoted, name = 'User') {
    const final = buildLimitCard(info, name);
    await sock.sendMessage(jid, { text: final }, quoted ? { quoted } : {});
    return null;
}

export function applyPlan(user, planKey) {
    const p = PLANS[planKey];
    if (!p) return false;
    user.plan = planKey;
    if (p.days > 0) {
        user.planExpiry = Date.now() + p.days * 24 * 60 * 60 * 1000;
    } else {
        user.planExpiry = 0;
    }
    if (planKey === 'registered' || p.days > 0) {
        user.registered = true;
    }
    if (planKey === 'free') {
        user.registered = false;
    }
    user.limitUsed = 0;
    user.lastLimitReset = Date.now();
    ensureLimitState(user);
    return true;
}

export function registerUser(user, { username, age, province } = {}) {
    if (user.registered) return false;
    user.registered = true;
    user.username = String(username || '').trim();
    user.age = Number(age) || 0;
    user.province = String(province || '').trim();
    if (user.username) user.name = user.username;
    if (!user.plan || user.plan === 'free') {
        user.plan = 'registered';
        user.planExpiry = 0;
    }
    ensureLimitState(user);
    return true;
}

export { RESET_MS, formatDuration, renderBattery };
