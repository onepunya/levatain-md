import { config } from '../config.js';
import { startDashboard } from '../dashboard/dashboard.js';
import { startCloudflaredTunnel } from '../dashboard/tunnel.js';
import { startIpWatcher } from '../api/index.js';
import { cleanTempFiles } from '../util/index.js';

const TEMP_CLEAN_INTERVAL = 15 * 60_000;

export function startBackgroundJobs() {
    const port = config.dashboardPort;
    const src = config.dashboardPortSource || 'default';
    console.log(`[dashboard] port ${port} (source: ${src})`);
    startDashboard(port);
    startIpWatcher(port);
    setTimeout(() => { startCloudflaredTunnel(port).catch(() => {}); }, 2500);
    setInterval(cleanTempFiles, TEMP_CLEAN_INTERVAL);
}
