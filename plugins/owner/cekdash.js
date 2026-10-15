import { getLocalIps, getHostname, lookupPublicIp } from '../../src/api/index.js';
import { getTunnelStatus } from '../../src/dashboard/tunnel.js';
import { msg } from '../../src/wa/index.js';
import { config } from '../../src/config.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('dashboard', 'cekdash', 'dashbot')
    .in('owner')
    .desc('Check bot dashboard link (public, local, tunnel)')
    .prefixOnly()
    .ownerOnly()
    .signal('User (owner) asks for dashboard link, check dashboard, or panel address', ['cekdash', 'link dashboard', 'dashbot'])
    .run(async (sock, {
        raw,
        from
    }) => {
        const port = config.dashboardPort;
        const portSrc = config.dashboardPortSource || 'default';

        await sock.sendMessage(from, { text: msg('wait.dashboard') }, { quoted: raw });

        const info = await lookupPublicIp();
        const local = getLocalIps();
        const host = getHostname();
        const tunnel = getTunnelStatus();

        const localLines = local.length
            ? local.map(l => `   • http://${l.address}:${port}  _(${l.name})_`).join('\n')
            : `   • http://127.0.0.1:${port}`;

        const publicLine = info.publicIp
            ? `http://${info.publicIp}:${port}${(info.city || info.country) ? `\n   📍 ${[info.city, info.country].filter(Boolean).join(', ')}` : ''}${info.isp ? `\n   🏢 ${info.isp}` : ''}`
            : '⚠️ Public IP not detected yet (server may be behind NAT/without port forwarding).';

        let tunnelBlock;
        if (tunnel.url) {
            tunnelBlock = `☁️ *Cloudflare Tunnel:*\n   ${tunnel.url}\n   ${tunnel.running ? '🟢 running' : '🟡 url cached'}`;
        } else if (tunnel.installing) {
            tunnelBlock = `☁️ *Cloudflare Tunnel:*\n   📥 downloading cloudflared…`;
        } else if (tunnel.running) {
            tunnelBlock = `☁️ *Cloudflare Tunnel:*\n   ⏳ still starting… (try .cekdash again in ~20s)`;
        } else {
            tunnelBlock = `☁️ *Cloudflare Tunnel:*\n   ⚠️ not available` +
                (tunnel.error ? `\n   _${String(tunnel.error).slice(0, 120)}_` : '\n   _cloudflared belum terpasang (auto-download atau pkg install cloudflared)_');
        }

        const status = global.botConnected ? '🟢 Connected' : '🔴 Disconnected';

        const text = `📊 *${global.botName || 'Bot'} Dashboard*\n\n` +
            `Status: ${status}\n` +
            `Host: ${host}\n` +
            `Port: ${port} _(from ${portSrc})_\n\n` +
            `${tunnelBlock}\n\n` +
            `🌐 *Public IP:*\n   ${publicLine}\n\n` +
            `🖥️ *Local:*\n${localLines}\n\n` +
            `_Tunnel link works without opening panel port._`;

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
