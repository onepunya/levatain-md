import { plugin } from '../../src/core/plugin.js';
import { getLimitInfo, animateLimitBar, buildLimitCard } from '../../src/limits/limit.js';
import { saveDb } from '../../src/storage/db.js';

export default plugin('limit', 'ceklimit')
    .in('limit')
    .desc('Check remaining usage limit with animated bar')
    .prefixOnly()
    .signal('User wants to check limit quota remaining', ['.limit', '.ceklimit'])
    .run(async (sock, {
        raw,
        from,
        primaryId,
        gdb,
        pushname
    }) => {
        const user = gdb.users[primaryId];
        if (!user) return;
        const info = getLimitInfo(user);
        await saveDb();
        try {
            await animateLimitBar(sock, from, info, raw, user.name || pushname || 'User');
        } catch {
            const card = buildLimitCard(info, user.name || pushname || 'User');
            await sock.sendMessage(from, { text: card }, { quoted: raw });
        }
    });
