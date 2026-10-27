import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/wa/messages.js';
export default plugin('ping')
    .in('main')
    .desc('Check bot status and latency')
    .prefixOnly()
    .signal('User asks to check bot status, ping, or latency', ['ping', 'is the bot alive?'])
    .run(async (sock, { reply }) => {
        const start = Date.now();
        await reply(msg('ping.pong'));
        const latency = Date.now() - start;
        await reply(msg('ping.latency', { ms: latency }));
    });
