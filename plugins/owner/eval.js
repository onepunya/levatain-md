import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getArgs, truncate } from '../../src/util/index.js';
import { ProgressMessage, msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

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

function getCwd(sessionKey) {
    return sessionCwd.get(sessionKey) || WORKSPACE_ROOT;
}

function resolveInWorkspace(base, target) {
    const resolved = path.resolve(base, target);
    if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) return null;
    return resolved;
}

export default plugin('exec', 'sh', 'term')
    .in('owner')
    .desc('Run shell commands (ls, cd, cat, curl, etc.) in the bot workspace. Owner only.')
    .prefixOnly()
    .ownerOnly()
    .signal('Owner asks to run/test shell commands, curl APIs, ls/cd/cat files, or anything that needs shell access', ['run this curl: curl https://api.example.com', 'try ls workspace', 'cd folder-test then ls', 'cat file.json in workspace'])
    .run(async (sock, {
        body,
        raw,
        from,
        reply
    }) => {
        const rawCmd = getArgs(body).trim();
        if (!rawCmd) {
            return reply(`💻 *Workspace Terminal*\nCwd: \`${getCwd(from).replace(WORKSPACE_ROOT, '~') || '~'}\`\n\nExample: \`.exec ls\`, \`.exec cd folder\`, \`.exec curl https://...\``);
        }

        if (BLOCKLIST.some(rx => rx.test(rawCmd))) {
            return reply(msg('fail.destructive', { cmd: rawCmd }));
        }

        const cwd = getCwd(from);

        if (/^cd(\s|$)/.test(rawCmd)) {
            const target = rawCmd.replace(/^cd\s*/, '').trim() || WORKSPACE_ROOT;
            const next = resolveInWorkspace(cwd, target);
            if (!next) return reply(msg('fail.workspace_escape'));
            if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
                return reply(msg('fail.folder_missing', { path: target }));
            }
            sessionCwd.set(from, next);
            return reply(`📁 Cwd: \`${next.replace(WORKSPACE_ROOT, '~') || '~'}\``);
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
    });
