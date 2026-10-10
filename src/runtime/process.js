import { logger } from '../util/index.js';
import { flushDb } from '../storage/db.js';

async function shutdown() {
    try { await flushDb(); } catch {}
    process.exit(0);
}


export function guardProcess() {
    setInterval(() => {}, 1 << 30);

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException',  (e) => logger.error(`[uncaughtException] ${e.message}`));
    process.on('unhandledRejection', (r) => logger.error(`[unhandledRejection] ${r}`));
}
