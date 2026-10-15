import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

const GITHUB_API = 'https://api.github.com';

const DEFAULT_EXCLUDES = [
    'node_modules',
    '.git',
    '.bin',
    'session',
    'database',
    'temp',
    'tmp',
    '.env',
    'cloudflared',
    'tunnel.log',
];

const SKIP_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svgz', '.avif', '.heic', '.tiff',
    '.mp3', '.ogg', '.opus', '.wav', '.m4a', '.aac', '.flac', '.amr',
    '.mp4', '.webm', '.mkv', '.mov', '.avi', '.3gp',
    '.zip', '.gz', '.tar', '.rar', '.7z', '.pdf', '.ttf', '.woff', '.woff2', '.otf',
    '.exe', '.so', '.bin', '.part',
]);

function isEnabled() {
    return !!(config.githubSync?.token && config.githubSync?.repo);
}

function getHeaders() {
    return {
        Authorization: `Bearer ${config.githubSync.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Levatain-MD',
    };
}

function loadGitignorePatterns(rootDir) {
    const gitignorePath = path.join(rootDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return [];
    return fs.readFileSync(gitignorePath, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('!'))
        .map(line => line.replace(/^\/+/, '').replace(/\/+$/, ''));
}

function isExcluded(relPath, patterns) {
    const segments = relPath.split('/');
    const base = segments[segments.length - 1];
    return patterns.some(pattern => {
        if (pattern.startsWith('*.')) return relPath.endsWith(pattern.slice(1));
        if (pattern.endsWith('*')) return base.startsWith(pattern.slice(0, -1));
        return segments.includes(pattern) || relPath === pattern;
    });
}

function walkFiles(rootDir, patterns) {
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            const rel = path.relative(rootDir, abs).split(path.sep).join('/');
            if (isExcluded(rel, patterns)) continue;
            if (entry.isDirectory()) walk(abs);
            else if (entry.isFile()) files.push({ abs, rel });
        }
    })(rootDir);
    return files;
}

function looksBinary(abs) {
    let fd;
    try {
        fd = fs.openSync(abs, 'r');
        const buf = Buffer.alloc(8000);
        const n = fs.readSync(fd, buf, 0, 8000, 0);
        return buf.subarray(0, n).includes(0);
    } catch {
        return true;
    } finally {
        if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    }
}

function isMedia(file) {
    const base = path.basename(file.rel).toLowerCase();
    if (base === 'cloudflared' || base.startsWith('cloudflared-')) return true;
    if (SKIP_EXTENSIONS.has(path.extname(base))) return true;
    return looksBinary(file.abs);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function githubRequest(url, options = {}, attempt = 1) {
    let res;
    try {
        res = await fetch(url, {
            ...options,
            headers: { ...getHeaders(), ...(options.headers || {}) },
        });
    } catch (e) {
        if (attempt < 3) {
            await sleep(1500 * attempt);
            return githubRequest(url, options, attempt + 1);
        }
        throw new Error(`Network error on ${url}: ${e.message}`);
    }

    if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429 || res.status === 403;
        if (retryable && attempt < 3) {
            await sleep(2000 * attempt);
            return githubRequest(url, options, attempt + 1);
        }
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub API ${res.status} on ${url}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

export function isGithubSyncEnabled() {
    return isEnabled();
}

export async function syncProjectToGithub({
    rootDir = process.cwd(),
    commitMessage,
    extraExcludes = [],
    onProgress,
} = {}) {
    if (!isEnabled()) {
        throw new Error('GitHub sync not configured. Set GITHUB_SYNC_REPO (and a token) in .env.');
    }

    const { repo, branch } = config.githubSync;
    const patterns = [...DEFAULT_EXCLUDES, ...extraExcludes, ...loadGitignorePatterns(rootDir)];

    const all = walkFiles(rootDir, patterns);
    const files = all.filter(file => !isMedia(file));
    const skipped = all.length - files.length;

    if (skipped) {
        logger.info(`[GithubSync] Skipped ${skipped} media/binary file(s)`);
    }

    if (!files.length) {
        throw new Error('No files found to push (check the exclude list).');
    }

    onProgress?.(`Found ${files.length} files, reading branch ref...`);

    const refData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`);
    const latestCommitSha = refData.object.sha;

    const commitData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/commits/${latestCommitSha}`);
    const baseTreeSha = commitData.tree.sha;

    const treeItems = [];
    let done = 0;
    for (const file of files) {
        const content = fs.readFileSync(file.abs, 'utf-8');

        const blobData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/blobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, encoding: 'utf-8' }),
        });

        treeItems.push({ path: file.rel, mode: '100644', type: 'blob', sha: blobData.sha });

        done++;
        if (done % 15 === 0 || done === files.length) {
            onProgress?.(`Uploaded ${done}/${files.length} files...`);
        }
    }

    onProgress?.('Creating tree...');
    const treeData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });

    onProgress?.('Creating commit...');
    const newCommitData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: commitMessage || `chore: sync from bot (${new Date().toISOString()})`,
            tree: treeData.sha,
            parents: [latestCommitSha],
        }),
    });

    onProgress?.('Updating branch ref...');
    await githubRequest(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommitData.sha }),
    });

    logger.success(`[GithubSync] Pushed ${files.length} files to ${repo}@${branch} (${newCommitData.sha.slice(0, 7)})`);

    return {
        filesCount: files.length,
        commitSha: newCommitData.sha,
        commitUrl: `https://github.com/${repo}/commit/${newCommitData.sha}`,
    };
}
