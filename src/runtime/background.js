import { config } from '../config.js';
import { startDashboard } from '../dashboard/dashboard.js';
import { startIpWatcher } from '../api/index.js';
import { cleanTempFiles } from '../util/index.js';

const TEMP_CLEAN_INTERVAL = 15 * 60_000;


export function startBackgroundJobs() {
    startDashboard(config.dashboardPort);
    startIpWatcher(config.dashboardPort);
    setInterval(cleanTempFiles, TEMP_CLEAN_INTERVAL);
}
