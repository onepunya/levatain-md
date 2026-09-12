import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getArgs } from '../../src/lib/utils.js';
import { ProgressMessage } from '../../src/lib/progress.js';

const execPromise = promisify(exec);

const WORKSPACE_ROOT = process.cwd();

const sessionCwd = new Map();

const BLOCKLIST = [
    /rm\s+-rf\s+\/(?!\S)/,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    />\s*\/dev\/(sd|nvme|hd)/,
    /\b(shutdown|reboot|poweroff)\b/,
    /\bchmod\s+-R\s+777\s+\//,
    /\bchown\s+-R\s+\S+\s+\//,
];

const MAX_OUT = 3500;

function truncate(text) {
    if (!text) return '';
    return text.length > MAX_OUT
        ? text.slice(0, MAX_OUT) + `\n… (dipotong, ${text.length - MAX_OUT} karakter lagi)`
        : text;
}

function getCwd(sessionKey) {
    return sessionCwd.get(sessionKey) || WORKSPACE_ROOT;
}

function resolveInWorkspace(base, target) {
    const resolved = path.resolve(base, target);
    if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) return null;
    return resolved;
}

export const meta = {
    interface: {
        cmd:      ['exec', 'sh', 'term'],
        tag:      'owner',
        aliasOnly: true,
        desc:     'Jalanin shell command (ls, cd, cat, curl, dll) di workspace bot. Owner only.',
        isOwner:  true,
        ai: {
            trigger: 'Owner minta jalanin/tes/cek command shell, curl API, ls/cd/cat file, atau apapun yang butuh eksekusi command beneran di server/workspace bot',
            examples: ['jalanin curl ini: curl https://api.example.com', 'coba ls workspace', 'cd folder-test terus ls', 'cat file.json di workspace'],
        },
        async run(sock, { body, raw, from }) {
            const rawCmd = getArgs(body).trim();
            if (!rawCmd) {
                return sock.sendMessage(from, {
                    text: `💻 *Workspace Terminal*\nCwd: \`${getCwd(from).replace(WORKSPACE_ROOT, '~') || '~'}\`\n\nContoh: \`.exec ls\`, \`.exec cd folder\`, \`.exec curl https://...\``,
                }, { quoted: raw });
            }

            if (BLOCKLIST.some(rx => rx.test(rawCmd))) {
                return sock.sendMessage(from, { text: `🛑 Command ini keliatan destruktif, aku tolak jalanin: \`${rawCmd}\`` }, { quoted: raw });
            }

            const cwd = getCwd(from);

            if (/^cd(\s|$)/.test(rawCmd)) {
                const target = rawCmd.replace(/^cd\s*/, '').trim() || WORKSPACE_ROOT;
                const next = resolveInWorkspace(cwd, target);
                if (!next) return sock.sendMessage(from, { text: `🛑 Gak boleh keluar dari folder workspace.` }, { quoted: raw });
                if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
                    return sock.sendMessage(from, { text: `❌ Folder gak ketemu: \`${target}\`` }, { quoted: raw });
                }
                sessionCwd.set(from, next);
                return sock.sendMessage(from, { text: `📁 Cwd: \`${next.replace(WORKSPACE_ROOT, '~') || '~'}\`` }, { quoted: raw });
            }

            const progress = new ProgressMessage(sock, from, raw);
            await progress.start(`💻 Running: \`${rawCmd}\``);
            const spin = setInterval(() => progress.stage(`💻Running: \`${rawCmd}\``), 1500);

            try {
                const { stdout, stderr } = await execPromise(rawCmd, {
                    cwd,
                    timeout: 30_000,
                    maxBuffer: 5 * 1024 * 1024,
                });
                const out = truncate(stdout?.trim()) || truncate(stderr?.trim()) || '(no output)';
                await progress.done(`✅\n\`\`\`${out}\`\`\``);
            } catch (err) {
                const out = truncate((err.stdout || '') + (err.stderr || err.message || ''));
                await progress.fail(`\`${rawCmd}\`\n\`\`\`${out || err.message}\`\`\``);
            } finally {
                clearInterval(spin);
            }
        },
    },
};
