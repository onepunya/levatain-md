import { logger } from '../lib/index.js';
import { config } from '../config.js';

const GITHUB_API = 'https://api.github.com';

function isEnabled() {
    return !!(config.github?.token && config.github?.repo);
}

function getHeaders() {
    return {
        Authorization: `Bearer ${config.github.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Levatain-MD',
    };
}

function getContentsUrl() {
    const { repo, path } = config.github;
    return `${GITHUB_API}/repos/${repo}/contents/${path}`;
}


export async function fetchRemoteDb() {
    if (!isEnabled()) return null;

    try {
        const res = await fetch(getContentsUrl(), {
            headers: getHeaders(),
        });

        if (res.status === 404) {
            logger.info('[RemoteDB] File not found on GitHub yet (will be created on first save).');
            return null;
        }

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
        }

        const data = await res.json();
        if (!data.content) {
            logger.warn('[RemoteDB] Empty content from GitHub.');
            return null;
        }

        const json = Buffer.from(data.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(json);

        logger.success('[RemoteDB] Loaded database from GitHub.');
        return { data: parsed, sha: data.sha };
    } catch (e) {
        logger.error(`[RemoteDB] Fetch failed: ${e.message}`);
        return null;
    }
}


export async function pushRemoteDb(db, knownSha = null) {
    if (!isEnabled() || !db) return false;

    try {
        let sha = knownSha;     
        if (!sha) {
            const current = await fetchRemoteDb();
            sha = current?.sha || null;
        }

        const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');

        const body = {
            message: `chore(db): sync database ${new Date().toISOString()}`,
            content,
            ...(sha ? { sha } : {}),
        };

        const res = await fetch(getContentsUrl(), {
            method: 'PUT',
            headers: {
                ...getHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();            
            if (res.status === 409) {
                logger.warn('[RemoteDB] SHA conflict, retrying with fresh SHA...');
                const fresh = await fetchRemoteDb();
                if (fresh?.sha) {
                    return pushRemoteDb(db, fresh.sha);
                }
            }
            throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
        }

        logger.info('[RemoteDB] Database synced to GitHub.');
        return true;
    } catch (e) {
        logger.error(`[RemoteDB] Push failed: ${e.message}`);
        return false;
    }
}
