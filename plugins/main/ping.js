import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';
export default plugin('ping')
    .in('main')
    .desc('Check bot status and latency')
    .prefixOnly()
    .signal('User asks to check bot status, ping, or latency', ['ping', 'is the bot alive?'])
    .run(async (sock, { raw, from, db, primaryId }) => {
        const start = Date.now();
        await sock.sendMessage(from, { text: msg('ping.pong') }, { quoted: raw });
        const latency = Date.now() - start;
        await sock.sendMessage(from, { text: msg('ping.latency', { ms: latency }) }, { quoted: raw });
    });

