import { getLocalIps, getHostname, lookupPublicIp } from '../../src/lib/iplookup.js';
import { config } from '../../src/config.js';

export const meta = {
    interface: {
        cmd:      ['dashboard', 'cekdash', 'dashbot'],
        tag:      'owner',
        aliasOnly: true,
        desc:     'Cek link dashboard bot (IP publik & lokal)',
        isOwner:  true,
        ai: {
            trigger: 'User (owner) minta link dashboard, cek dashboard, atau alamat panel bot',
            examples: ['cekdash', 'link dashboard', 'dashbot'],
        },
        async run(sock, { raw, from }) {
            const port = config.dashboardPort;

            await sock.sendMessage(from, { text: '🔍 Ngecek alamat dashboard...' }, { quoted: raw });

            const info  = await lookupPublicIp();
            const local = getLocalIps();
            const host  = getHostname();

            const localLines = local.length
                ? local.map(l => `   • http://${l.address}:${port}  _(${l.name})_`).join('\n')
                : `   • http://127.0.0.1:${port}`;

            const publicLine = info.publicIp
                ? `http://${info.publicIp}:${port}${(info.city || info.country) ? `\n   📍 ${[info.city, info.country].filter(Boolean).join(', ')}` : ''}${info.isp ? `\n   🏢 ${info.isp}` : ''}`
                : '⚠️ IP publik belum terdeteksi (server mungkin di belakang NAT/tanpa port forwarding).';

            const status = global.botConnected ? '🟢 Connected' : '🔴 Disconnected';

            const text = `📊 *${global.botName || 'Bot'} Dashboard*\n\n` +
                `Status: ${status}\n` +
                `Host: ${host}\n\n` +
                `🌐 *Publik:*\n   ${publicLine}\n\n` +
                `🖥️ *Lokal:*\n${localLines}\n\n` +
                `_Kalau diakses dari luar, pastikan port ${port} udah di-forward/dibuka di firewall._`;

            await sock.sendMessage(from, { text }, { quoted: raw });
        },
    },
};

