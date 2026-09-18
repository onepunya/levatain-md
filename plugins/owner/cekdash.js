import {  getLocalIps, getHostname, lookupPublicIp, msg } from '../../src/lib/index.js';
import { config } from '../../src/config.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('dashboard', 'cekdash', 'dashbot')
    .in('owner')
    .desc('Check bot dashboard link (public & local IP)')
    .prefixOnly()
    .ownerOnly()
    .signal('User (owner) asks for dashboard link, check dashboard, or panel address', ['cekdash', 'link dashboard', 'dashbot'])
    .run(async (sock, { raw, from }) => {
        const port = config.dashboardPort;

        await sock.sendMessage(from, { text: msg('wait.dashboard') }, { quoted: raw });

        const info  = await lookupPublicIp();
        const local = getLocalIps();
        const host  = getHostname();

        const localLines = local.length
            ? local.map(l => `   • http://${l.address}:${port}  _(${l.name})_`).join('\n')
            : `   • http://127.0.0.1:${port}`;

        const publicLine = info.publicIp
            ? `http://${info.publicIp}:${port}${(info.city || info.country) ? `\n   📍 ${[info.city, info.country].filter(Boolean).join(', ')}` : ''}${info.isp ? `\n   🏢 ${info.isp}` : ''}`
            : '⚠️ Public IP not detected yet (server may be behind NAT/without port forwarding).';

        const status = global.botConnected ? '🟢 Connected' : '🔴 Disconnected';

        const text = `📊 *${global.botName || 'Bot'} Dashboard*\n\n` +
            `Status: ${status}\n` +
            `Host: ${host}\n\n` +
            `🌐 *Public:*\n   ${publicLine}\n\n` +
            `🖥️ *Local:*\n${localLines}\n\n` +
            `_If accessed from outside, make sure port ${port} is forwarded/open on the firewall._`;

        await sock.sendMessage(from, { text }, { quoted: raw });
    });

