import fs from 'fs/promises';
import { logger } from '../lib/logger.js';

const AI_DB_PATH  = './database/ai_db.json';
const MAX_HISTORY = 30;
const MEMORY_TTL  = 7 * 24 * 60 * 60 * 1000;

let _db     = null;
let _dirty  = false;
let _timer  = null;

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

export const getHistory = async (userId) => {
    const db    = await load();
    const entry = db.users[userId];
    if (!entry) return [];
    if (entry.lastActive && entry.lastActive < Date.now() - MEMORY_TTL) {
        entry.history = [];
        save();
        return [];
    }
    return entry.history || [];
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
        db.users[userId].history    = [];
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
