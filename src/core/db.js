import fs from 'fs/promises';
import { logger } from '../lib/index.js';
import { fetchRemoteDb, pushRemoteDb } from './remoteDb.js';

const DB_PATH = './database/db.json';

let _db    = null;
let _dirty = false;
let _timer = null;
let _remoteSha = null;       
let _remoteTimer = null;     
const userSchema = (m) => ({
    jid:         '',
    lid:         '',
    name:        m?.pushname || 'User',
    hit:         0,
    banned:      false,
    bannedReason:'',
    lastChat:    Date.now(),
    warns:       0,
});

const groupSchema = () => ({
    welcome:  false,
    antilink: false,
    mute:     false,
    captcha:  false,
    autodl:   false,
    warns:    {},
    afk:      {},
    leftText: '',
    lastActivity: Date.now(),
});

const settingsSchema = () => ({
    maintenance: false,
    mode:        'public',
    stickerCmds: {},
});

export async function loadDb() {
    if (_db) return _db;
    try {
        _db = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
    } catch {
        _db = { users: {}, groups: {}, settings: settingsSchema() };
    }
    return _db;
}

export async function saveDb() {
    _dirty = true;
    if (_timer) return;
    _timer = setTimeout(async () => {
        _timer = null;
        if (!_dirty || !_db) return;
        _dirty = false;
        await _write();
    }, 1500);
}

export async function flushDb() {
    if (!_db) return;
    await _write(true); 
}

async function _write(forceRemote = false) {
    try {
        await fs.mkdir('./database', { recursive: true });
        const tmp = DB_PATH + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(_db, null, 2));
        await fs.rename(tmp, DB_PATH);
    } catch (e) {
        logger.error(`[DB] Save failed: ${e.message}`);
    }

    
    scheduleRemotePush(forceRemote);
}

function scheduleRemotePush(immediate = false) {
    if (_remoteTimer) {
        clearTimeout(_remoteTimer);
        _remoteTimer = null;
    }

    const delay = immediate ? 0 : 8000;

    _remoteTimer = setTimeout(async () => {
        _remoteTimer = null;
        if (!_db) return;
        const ok = await pushRemoteDb(_db, _remoteSha);
        if (ok) {            
            const remote = await fetchRemoteDb();
            if (remote?.sha) _remoteSha = remote.sha;
        }
    }, delay);
}

export async function initDb() {
    const remote = await fetchRemoteDb();
    if (remote?.data) {
        _db = remote.data;
        _remoteSha = remote.sha;
        logger.info('[DB] Using database recovered from GitHub.');
    } else {        
        await loadDb();
    }    
    if (!_db.users)    _db.users    = {};
    if (!_db.groups)   _db.groups   = {};
    if (!_db.settings) _db.settings = settingsSchema();
    for (const [k, v] of Object.entries(settingsSchema())) {
        if (!(k in _db.settings)) _db.settings[k] = v;
    }
    if (typeof _db.settings.self === 'boolean') {
        if (_db.settings.self) _db.settings.mode = 'private';
        delete _db.settings.self;
    }

    global.db = _db;
    _dirty = true;
    await _write(true);
    return _db;
}

export function ensureUser(db, primaryId, m) {
    if (!db.users[primaryId]) {
        db.users[primaryId] = userSchema(m);
        _dirty = true;
    }
    for (const [k, v] of Object.entries(userSchema(m))) {
        if (!(k in db.users[primaryId])) {
            db.users[primaryId][k] = v;
            _dirty = true;
        }
    }
    db.users[primaryId].lastChat = Date.now();
    _dirty = true;
}

export function ensureGroup(db, groupId) {
    if (!db.groups[groupId]) {
        db.groups[groupId] = groupSchema();
        _dirty = true;
    }
    for (const [k, v] of Object.entries(groupSchema())) {
        if (!(k in db.groups[groupId])) {
            db.groups[groupId][k] = v;
            _dirty = true;
        }
    }
}

export function scheduleAutoReset() {
    const now  = new Date();
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    const ms = next - now;

    setTimeout(async () => {
        const db = await loadDb();
        let count = 0;
        for (const id in db.users) {
            db.users[id].lastReset = Date.now();
            count++;
        }
        db.settings.lastReset = Date.now();
        _dirty = true;
        await _write();
        logger.info(`Auto reset done for ${count} users.`);
        scheduleAutoReset();
    }, ms);

    logger.info(`Auto reset in ${Math.round(ms / 1000 / 60)} minutes.`);
}
