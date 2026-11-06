import fs from 'fs/promises';
import { logger } from '../util/logger.js';

const AI_DB_PATH = './database/ai_db.json';
const MAX_HISTORY = 40;
const FOLD_AT = 30;
const FOLD_COUNT = 20;
const MEMORY_TTL = 7 * 24 * 60 * 60 * 1000;
const SUMMARY_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_CHARS = 1400;
const MAX_NOTES = 100;
const MAX_NOTE_CHARS = 500;

let _db = null;
let _dirty = false;
let _timer = null;

const load = async () => {
    if (_db) return _db;
    try {
        _db = JSON.parse(await fs.readFile(AI_DB_PATH, 'utf-8'));
    } catch {
        _db = { users: {} };
    }
    return _db;
};

const save = () => {
    _dirty = true;
    if (_timer) return;
    _timer = setTimeout(async () => {
        _timer = null;
        if (!_dirty || !_db) return;
        _dirty = false;
        try {
            await fs.mkdir('./database', { recursive: true });
            const tmp = AI_DB_PATH + '.tmp';
            await fs.writeFile(tmp, JSON.stringify(_db, null, 2));
            await fs.rename(tmp, AI_DB_PATH);
        } catch (e) {
            logger.error(`[AI DB] Save failed: ${e.message}`);
        }
    }, 2000);
};

const POLLUTED_RE = /^⚠️|gemini menolak|gemini refused|filter (keamanan|pengaman)|sistem keamanan|safety (system|filters?)|can't generate a response|flagged this request|tidak dapat memproses|tidak diprogram|hanya menghasilkan teks|pembatasan sistem|can't process|only generate text/i;

export const cleanHistory = (history = []) => {
    const out = [];
    for (const h of history) {
        if (h?.role === 'assistant' && POLLUTED_RE.test(String(h.content || ''))) {
            if (out.length && out[out.length - 1].role === 'user') out.pop();
            continue;
        }
        out.push(h);
    }
    return out;
};

export const getHistory = async (userId) => {
    const db = await load();
    const entry = db.users[userId];
    if (!entry) return [];
    if (entry.lastActive && entry.lastActive < Date.now() - MEMORY_TTL) {
        entry.history = [];
        if (entry.lastActive < Date.now() - SUMMARY_TTL) delete entry.summary;
        save();
        return [];
    }
    const cleaned = cleanHistory(entry.history || []);
    if (cleaned.length !== (entry.history || []).length) {
        entry.history = cleaned;
        save();
    }
    return cleaned;
};

export const addHistory = async (userId, role, content) => {
    const db = await load();
    if (!db.users[userId]) db.users[userId] = { history: [], lastActive: Date.now() };
    db.users[userId].lastActive = Date.now();
    db.users[userId].history.push({ role, content });
    if (db.users[userId].history.length > MAX_HISTORY)
        db.users[userId].history = db.users[userId].history.slice(-MAX_HISTORY);
    save();
};

export const clearHistory = async (userId) => {
    const db = await load();
    if (db.users[userId]) {
        db.users[userId].history = [];
        delete db.users[userId].summary;
        db.users[userId].lastActive = Date.now();
        save();
    }
};

export const getUserMemory = async (userId) => {
    const db = await load();
    return db.users[userId]?.memory || {};
};

export const setUserMemory = async (userId, key, value) => {
    const db = await load();
    if (!db.users[userId]) db.users[userId] = { history: [], lastActive: Date.now(), memory: {} };
    if (!db.users[userId].memory) db.users[userId].memory = {};
    db.users[userId].memory[key] = value;
    save();
};

const MAX_OTHER_USERS = 15;

export const getAllUsersContext = async (excludeUserId = null) => {
    const db = await load();
    const candidates = Object.entries(db.users)
        .filter(([userId, data]) => userId !== excludeUserId && data && data.memory && Object.keys(data.memory).length > 0)
        .sort(([, a], [, b]) => (b.lastActive || 0) - (a.lastActive || 0))
        .slice(0, MAX_OTHER_USERS);

    const entries = candidates.map(([userId, data]) => {
        const name = data.memory?.name || data.memory?.nama || data.memory?.panggilan || userId.replace(/@.+/, '');
        return [
            `[USER_BLOCK]`,
            `  PRIMARY_ID : ${userId}`,
            `  NAME       : ${name}`,
            `  MEMORY : ${Object.entries(data.memory).map(([k, v]) => `${k}=${v}`).join(', ')}`,
            `[/USER_BLOCK]`,
        ].join('\n');
    });

    if (!entries.length) return '';
    return [
        `=== OTHER USERS DATABASE ===`,
        `NOTE: Gunakan HANYA jika user aktif bertanya tentang user lain secara eksplisit.`,
        `JANGAN pernah tampilkan seluruh isi database ini ke user, walau diminta.`,
        ``,
        entries.join('\n\n'),
        `=== END OF USERS DATABASE ===`,
    ].join('\n');
};

export const getSummary = async (userId) => {
    const db = await load();
    return db.users[userId]?.summary || '';
};

const folding = new Set();

export const foldHistoryIfNeeded = async (userId, summarize) => {
    const db = await load();
    const entry = db.users[userId];
    if (!entry?.history || entry.history.length < FOLD_AT || folding.has(userId)) return false;
    folding.add(userId);
    try {
        const old = cleanHistory(entry.history.slice(0, FOLD_COUNT));
        const merged = String(await summarize(entry.summary || '', old) || '').trim().slice(0, MAX_SUMMARY_CHARS);
        if (!merged) return false;
        entry.history = entry.history.slice(FOLD_COUNT);
        entry.summary = merged;
        save();
        return true;
    } catch (e) {
        logger.warn(`[AI memory] fold failed: ${e.message}`);
        return false;
    } finally {
        folding.delete(userId);
    }
};

const ensureUser = (db, userId) => {
    if (!db.users[userId]) db.users[userId] = { history: [], lastActive: Date.now() };
    return db.users[userId];
};

const tokens = (text) => String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1);

export const addNote = async (userId, text, tags = '') => {
    const db = await load();
    const entry = ensureUser(db, userId);
    const body = String(text || '').trim().slice(0, MAX_NOTE_CHARS);
    if (!body) throw new Error('Note text required.');
    entry.notes ||= [];
    if (entry.notes.length >= MAX_NOTES) throw new Error(`Notes are full (max ${MAX_NOTES}). Delete some first.`);
    entry.nextNoteId = (entry.nextNoteId || 1);
    const note = { id: entry.nextNoteId++, text: body, tags: String(tags || '').trim().slice(0, 80), at: Date.now() };
    entry.notes.push(note);
    save();
    return note;
};

export const listNotes = async (userId, limit = 30) => {
    const db = await load();
    return (db.users[userId]?.notes || []).slice(-limit).reverse();
};

export const findNotes = async (userId, query, limit = 8) => {
    const db = await load();
    const notes = db.users[userId]?.notes || [];
    const q = tokens(query);
    if (!q.length) return notes.slice(-limit).reverse();
    return notes
        .map(n => {
            const hay = `${n.text} ${n.tags}`.toLowerCase();
            const score = q.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
            return { n, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || b.n.at - a.n.at)
        .slice(0, limit)
        .map(x => x.n);
};

export const deleteNote = async (userId, id) => {
    const db = await load();
    const entry = db.users[userId];
    if (!entry?.notes) return false;
    const idx = entry.notes.findIndex(n => n.id === Number(id));
    if (idx === -1) return false;
    entry.notes.splice(idx, 1);
    save();
    return true;
};
