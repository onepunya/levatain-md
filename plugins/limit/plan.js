import { plugin } from '../../src/core/plugin.js';
import { PLANS, getLimitInfo, buildLimitCard } from '../../src/lib/limit.js';
import { config } from '../../src/config.js';

export default plugin('plan', 'beli', 'harga')
    .in('limit')
    .desc('View limit packages & how to buy')
    .prefixOnly()
    .signal('User asks about limit plans prices or how to buy premium', ['.plan', '.beli', '.harga'])
    .run(async (sock, { raw, from, primaryId, gdb, pushname }) => {
        const user = gdb.users[primaryId];
        const info = user ? getLimitInfo(user) : null;
        const ownerNum = (config.owner.number || '').replace(/\D/g, '');
        const waLink = ownerNum ? `https://wa.me/${ownerNum}` : 'owner';

        const text = [
            `💎 *Levatain Limit Packages*`,
            ``,
            `┌─ *Free* (no login)`,
            `│  Limit *100%* · resets every 3 hours`,
            `│  Price: free`,
            `├─ *Registered* (.register user age province)`,
            `│  Limit *200%* · resets every 3 hours`,
            `│  Price: free`,
            `├─ *Basic* · 7 days`,
            `│  Limit *300%* · resets every 3 hours`,
            `│  Price: *Rp 5.000*`,
            `├─ *Pro* · 16 days`,
            `│  Limit *500%* · resets every 3 hours`,
            `│  Price: *Rp 10.000*`,
            `└─ *Max* · 30 days`,
            `   Limit *1000%* · resets every 3 hours`,
            `   Price: *Rp 20.000*`,
            ``,
            `📌 *How to buy*`,
            `1. Transfer the package price`,
            `2. Screenshot the payment proof`,
            `3. Chat owner: ${waLink}`,
            `4. Send proof + your WA number + package name`,
            `5. Owner will activate your plan`,
            ``,
            info ? buildLimitCard(info, user?.name || pushname || 'User') : '',
            ``,
            `_Limit resets automatically every 3 hours, even if the bot restarts._`,
        ].filter(Boolean).join('\n');

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
