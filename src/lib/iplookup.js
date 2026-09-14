import os from 'os';
import axios from 'axios';
import { logger } from './logger.js';

let cache = {
    publicIp:  null,
    isp:       null,
    city:      null,
    country:   null,
    fetchedAt: 0,
};

const CACHE_TTL = 10 * 60_000;

export function getLocalIps() {
    const ifaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                result.push({ name, address: iface.address });
            }
        }
    }
    return result;
}

export function getHostname() {
    return os.hostname();
}

export async function lookupPublicIp({ force = false } = {}) {
    if (!force && cache.publicIp && Date.now() - cache.fetchedAt < CACHE_TTL) {
        return cache;
    }

    try {
        const { data } = await axios.get('http://ip-api.com/json/?fields=status,message,country,city,isp,query', { timeout: 5000 });
        if (data?.status === 'success') {
            cache = {
                publicIp:  data.query,
                isp:       data.isp || null,
                city:      data.city || null,
                country:   data.country || null,
                fetchedAt: Date.now(),
            };
            return cache;
        }
    } catch {}

    try {
        const { data } = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        if (data?.ip) {
            cache = { publicIp: data.ip, isp: null, city: null, country: null, fetchedAt: Date.now() };
            return cache;
        }
    } catch {}

    logger.warn('Gagal auto-detect IP publik (semua layanan lookup gagal/offline).');
    return cache;
}

export function getCachedIpInfo() {
    return cache;
}

export function startIpWatcher(port) {
    const announce = async (force) => {
        const info  = await lookupPublicIp({ force });
        const local = getLocalIps();
        const host  = getHostname();

        const localStr = local.length
            ? local.map(l => `${l.address}:${port}`).join(', ')
            : `127.0.0.1:${port}`;

        if (info.publicIp) {
            const geo = [info.city, info.country].filter(Boolean).join(', ');
            logger.success(`🌐 Publik: ${info.publicIp}:${port}${geo ? ` (${geo}${info.isp ? ` — ${info.isp}` : ''})` : ''}`);
        }
        logger.info(`🖥️  Host: ${host} | Lokal: ${localStr}`);
    };

    announce(true);
    setInterval(() => announce(true), CACHE_TTL);
}
