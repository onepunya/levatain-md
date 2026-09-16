import { plugin } from '../../src/core/plugin.js';
export default plugin('ping')
    .in('main')
    .desc('Cek status dan kecepatan bot')
    .prefixOnly()
    .signal('User minta cek status bot, ping, atau latency', ['ping', 'bot masih hidup?'])
    .run(async (sock, { raw, from }) => {
        const start = Date.now();
        await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: raw });
        const latency = Date.now() - start;
        await sock.sendMessage(from, { text: `⚡ *${latency}ms*` }, { quoted: raw });
    });

