import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

const GITHUB_API = 'https://api.github.com';

const DEFAULT_EXCLUDES = [
    'node_modules',
    '.git',
    'session',
    'database',
    '.env',
];

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
    '.mp3', '.mp4', '.ogg', '.opus', '.wav', '.webm',
    '.zip', '.gz', '.ttf', '.woff', '.woff2', '.otf', '.pdf',
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
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.replace(/^\/+/, '').replace(/\/+$/, ''));
}

function isExcluded(relPath, patterns) {
    const segments = relPath.split('/');
    return patterns.some(pattern => {
        if (pattern.startsWith('*.')) return relPath.endsWith(pattern.slice(1));
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
            else files.push({ abs, rel });
        }
    })(rootDir);
    return files;
}

async function githubRequest(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers || {}) },
    });
    if (!res.ok) {
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
    const files = walkFiles(rootDir, patterns);

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
        const buffer = fs.readFileSync(file.abs);
        const ext = path.extname(file.rel).toLowerCase();
        const isBinary = BINARY_EXTENSIONS.has(ext);

        const blobData = await githubRequest(`${GITHUB_API}/repos/${repo}/git/blobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                isBinary
                    ? { content: buffer.toString('base64'), encoding: 'base64' }
                    : { content: buffer.toString('utf-8'), encoding: 'utf-8' }
            ),
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
