import fs from 'fs/promises';
import { logger } from '../util/logger.js';

const FILE = './database/schedules.json';
const TICK_MS = 15_000;
const MAX_PENDING_USER = 20;
const MAX_PENDING_OWNER = 100;
const MIN_REPEAT_USER_MS = 60 * 60_000;
const MIN_REPEAT_OWNER_MS = 60_000;
const MAX_HORIZON_MS = 366 * 24 * 60 * 60_000;
const MAX_TEXT = 800;
const STALE_ONCE_MS = 48 * 60 * 60_000;

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const UNIT_ALIAS = {
    s: 's', sec: 's', secs: 's', second: 's', seconds: 's', detik: 's',
    m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm', menit: 'm',
    h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', jam: 'h',
    d: 'd', day: 'd', days: 'd', hari: 'd',
    w: 'w', wk: 'w', week: 'w', weeks: 'w', minggu: 'w',
};

let db = null;
let saveTimer = null;
let timer = null;
let ticking = false;
let taskRunner = null;
export const setTaskRunner = (fn) => { taskRunner = fn; };

export const getTimezone = () => process.env.BOT_TIMEZONE || 'Asia/Jakarta';
const tz = getTimezone;

async function load() {
    if (db) return db;
    try {
        db = JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch {
        db = { nextId: 1, items: [] };
    }
    if (!Array.isArray(db.items)) db.items = [];
    if (!Number.isFinite(db.nextId)) db.nextId = 1;
    return db;
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
        saveTimer = null;
        try {
            await fs.mkdir('./database', { recursive: true });
            const tmp = `${FILE}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(db, null, 2));
            await fs.rename(tmp, FILE);
        } catch (e) {
            logger.error(`[scheduler] save failed: ${e.message}`);
        }
    }, 800);
}

export function tzOffsetMs(ms, zone = tz()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find(p => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - Math.floor(ms / 1000) * 1000;
}

export function localToUtc(y, mo, d, h, mi, zone = tz()) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let utc = guess - tzOffsetMs(guess, zone);
    utc = guess - tzOffsetMs(utc, zone);
    return utc;
}

export function formatLocal(ms, zone = tz(), lang = 'id') {
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
        timeZone: zone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(ms)).replace(/\./g, ':');
}

export function nowParts(ms = Date.now(), zone = tz()) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ms));
    const g = (t) => Number(f.find(p => p.type === t)?.value);
    return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
}

export function parseDuration(text) {
    const s = String(text || '').toLowerCase().replace(/,/g, ' ').replace(/\band\b|\bdan\b/g, ' ');
    let total = 0;
    let matched = 0;
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
        const unit = UNIT_ALIAS[m[2]];
        if (!unit) return null;
        total += Number(m[1]) * UNIT_MS[unit];
        matched++;
    }
    const rest = s.replace(/(\d+(?:\.\d+)?)\s*([a-z]+)/g, '').replace(/\s+/g, '');
    if (!matched || rest) return null;
    return Math.round(total);
}

export function parseWhen(spec, now = Date.now()) {
    const s = String(spec || '').trim().replace(/\s+/g, ' ');
    let m = /^(?:in|dalam)\s+(.+)$/i.exec(s);
    if (m) {
        const ms = parseDuration(m[1]);
        if (!ms || ms < 1000) throw new Error(`Cannot read duration "${m[1]}". Use e.g. "in 30m", "in 2h 15m", "in 1d".`);
        return now + ms;
    }
    m = /^(?:at|pada)\s+(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/i.exec(s);
    if (m) return localToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]);
    m = /^(?:at|pada)\s+(\d{1,2}):(\d{2})$/i.exec(s);
    if (m) {
        const p = nowParts(now);
        let due = localToUtc(p.y, p.mo, p.d, +m[1], +m[2]);
        if (due <= now) due = localToUtc(p.y, p.mo, p.d + 1, +m[1], +m[2]);
        return due;
    }
    throw new Error('Unknown time format. Use "in 30m", "in 2h", "at 07:00" (next occurrence) or "at 2026-11-07 07:00" (local time, ' + tz() + ').');
}

export function parseRepeat(spec) {
    const s = String(spec || '').trim().toLowerCase();
    if (!s) return null;
    if (/^(daily|harian|every day|setiap hari|tiap hari)$/.test(s)) return { everyMs: UNIT_MS.d, label: 'daily' };
    if (/^(weekly|mingguan|every week|setiap minggu|tiap minggu)$/.test(s)) return { everyMs: UNIT_MS.w, label: 'weekly' };
    const m = /^(?:every|setiap|tiap)\s+(.+)$/.exec(s);
    const ms = parseDuration(m ? m[1] : s);
    if (!ms) throw new Error('Unknown repeat. Use "daily", "weekly" or "every 2h".');
    return { everyMs: ms, label: `every ${m ? m[1] : s}` };
}

export async function addSchedule({ owner, chat, type = 'remind', text, due, repeat = null, isOwner = false, lang = 'id', mention = null }) {
    await load();
    const body = String(text || '').trim().slice(0, MAX_TEXT);
    if (!body) throw new Error('Message required.');
    const now = Date.now();
    if (due < now - 1000) throw new Error('That time is already in the past.');
    if (due - now > MAX_HORIZON_MS) throw new Error('Too far ahead (max 1 year).');
    if (repeat) {
        const min = isOwner ? MIN_REPEAT_OWNER_MS : MIN_REPEAT_USER_MS;
        if (repeat.everyMs < min) throw new Error(`Repeat interval too short (min ${isOwner ? '1 minute' : '1 hour'}).`);
    }
    const pending = db.items.filter(i => i.owner === owner).length;
    if (pending >= (isOwner ? MAX_PENDING_OWNER : MAX_PENDING_USER)) throw new Error(`Too many pending reminders (max ${isOwner ? MAX_PENDING_OWNER : MAX_PENDING_USER}). Cancel some first.`);
    const item = { id: db.nextId++, owner, chat, type, text: body, due: Math.max(due, now + 1000), repeat, isOwner: !!isOwner, lang, mention, createdAt: now };
    db.items.push(item);
    scheduleSave();
    return item;
}

export async function listSchedules(owner, { all = false } = {}) {
    await load();
    return db.items.filter(i => all || i.owner === owner).sort((a, b) => a.due - b.due);
}

export async function cancelSchedule(owner, id, { isOwner = false } = {}) {
    await load();
    const idx = db.items.findIndex(i => i.id === Number(id) && (isOwner || i.owner === owner));
    if (idx === -1) return false;
    db.items.splice(idx, 1);
    scheduleSave();
    return true;
}

async function deliver(item) {
    const sock = global.sock;
    if (!sock || !global.botConnected) return false;
    const mentions = item.mention ? [item.mention] : [];
    const tag = item.mention && item.chat.endsWith('@g.us') ? `@${item.mention.split('@')[0]} ` : '';

    if (item.type === 'task') {
        const run = taskRunner || (await import('../ai/scheduled.js')).runScheduledTask;
        const out = await run(item);
        const header = item.lang === 'id' ? `🗓️ *Tugas terjadwal #${item.id}*` : `🗓️ *Scheduled task #${item.id}*`;
        await sock.sendMessage(item.chat, { text: `${tag}${header}\n\n${out}`, mentions });
        return true;
    }
    const header = item.lang === 'id' ? '⏰ *Pengingat*' : '⏰ *Reminder*';
    await sock.sendMessage(item.chat, { text: `${tag}${header}\n${item.text}`, mentions });
    return true;
}

async function tick() {
    if (ticking) return;
    ticking = true;
    try {
        await load();
        const now = Date.now();
        const due = db.items.filter(i => i.due <= now);
        for (const item of due) {
            if (!item.repeat && now - item.due > STALE_ONCE_MS) {
                db.items = db.items.filter(x => x.id !== item.id);
                scheduleSave();
                continue;
            }
            let sent = false;
            try {
                sent = await deliver(item);
            } catch (e) {
                logger.error(`[scheduler] #${item.id} failed: ${e.message}`);
                item.failures = (item.failures || 0) + 1;
                if (item.failures >= 3) sent = true;
                else item.due = now + 60_000;
            }
            if (!sent) continue;
            if (item.repeat) {
                let next = item.due + item.repeat.everyMs;
                if (next <= now) next += Math.ceil((now - next) / item.repeat.everyMs + 0.0001) * item.repeat.everyMs;
                item.due = next;
                item.failures = 0;
            } else {
                db.items = db.items.filter(x => x.id !== item.id);
            }
            scheduleSave();
        }
    } catch (e) {
        logger.error(`[scheduler] tick: ${e.message}`);
    } finally {
        ticking = false;
    }
}

export function startScheduler() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
    timer.unref?.();
    tick();
    logger.info('[scheduler] started');
}

export function stopScheduler() {
    if (timer) clearInterval(timer);
    timer = null;
}

export const _internal = { tick, load, reset: () => { db = null; } };
