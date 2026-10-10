import chalk from 'chalk';
import fs from 'fs';
import { config } from '../config.js';

try { fs.mkdirSync('./logs', { recursive: true }); } catch {}

const RING_LIMIT = 30;
export const recentCommands = [];
export const recentLogs     = [];

const time = () => new Date().toLocaleString('id-ID', {
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
});

const pushRing = (arr, item) => {
    arr.unshift(item);
    if (arr.length > RING_LIMIT) arr.length = RING_LIMIT;
};

const writeLog = (level, msg) => {
    try {
        fs.appendFileSync('./logs/bot.log', `[${time()}] [${level}] ${msg}\n`);
    } catch {}
};

const LEVEL_STYLE = {
    INFO:    { label: 'INFO   ', color: chalk.blue },
    SUCCESS: { label: 'SUCCESS', color: chalk.green },
    WARN:    { label: 'WARN   ', color: chalk.yellow },
    ERROR:   { label: 'ERROR  ', color: chalk.red },
    DEBUG:   { label: 'DEBUG  ', color: chalk.gray },
};

const log = (level, msg) => {
    const { label, color } = LEVEL_STYLE[level];
    console.log(`${chalk.cyan(`[${time()}]`)} ${color(label)} => ${msg}`);
    writeLog(level, msg);
    pushRing(recentLogs, { level, msg, time: time() });
};

const shortId = (id) => id.replace(/@.+/, '').slice(0, 15);

export const logger = {
    info:    (msg) => log('INFO', msg),
    success: (msg) => log('SUCCESS', msg),
    warn:    (msg) => log('WARN', msg),
    error:   (msg) => log('ERROR', msg),
    debug:   (msg) => { if (config.debug) log('DEBUG', msg); },

    cmd: (sender, cmd) => {
        const short = shortId(sender);
        console.log(`${chalk.cyan(`[${time()}]`)} ${chalk.magenta('EXEC   ')} => ${chalk.bgMagenta.black(` ${cmd} `)} by ${chalk.yellow(short)}`);
        writeLog('CMD', `${cmd} by ${sender}`);
        pushRing(recentCommands, { cmd, sender: short, time: time() });
        pushRing(recentLogs, { level: 'CMD', msg: `${cmd} — ${short}`, time: time() });
    },

    chat: (sender, text, { isGroup = false, groupName = '' } = {}) => {
        const short   = shortId(sender);
        const snippet = (text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const where   = isGroup ? ` @ ${groupName || 'group'}` : '';
        console.log(`${chalk.cyan(`[${time()}]`)} ${chalk.blueBright('CHAT   ')} => ${chalk.yellow(short)}${chalk.gray(where)}: ${snippet}`);
        writeLog('CHAT', `${short}${where}: ${snippet}`);
        pushRing(recentLogs, { level: 'CHAT', msg: `${short}${where}: ${snippet}`, time: time() });
    },
};
