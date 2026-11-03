import { getArgs } from '../../src/util/index.js';
import { plugin } from '../../src/core/plugin.js';
import { agentRollback } from '../../src/ai/agent.js';

export default plugin('agentundo', 'undopatch')
    .in('owner')
    .desc('Restore a file the AI patched back to its first backup. Owner only.')
    .prefixOnly()
    .ownerOnly()
    .run(async (sock, {
        body,
        reply
    }) => {
        const file = getArgs(body).trim();
        if (!file) return reply('Usage: .agentundo <file>');
        try {
            const res = await agentRollback(file);
            await reply(res.ok ? `Restored ${res.file}` : res.error);
        } catch (e) {
            await reply(e.message);
        }
    });
