import { plugin } from '../../src/core/plugin.js';
import { refreshMenuText, ensureMenuText, menuTextStatus } from '../../src/menu/menuText.js';

ensureMenuText();

export default plugin('menurefresh', 'menutext')
    .in('owner')
    .desc('Force regenerate menu text via LLM and show status')
    .prefixOnly()
    .ownerOnly()
    .run(async (sock, { reply }) => {
        await reply('⏳ Generating menu text via LLM...');
        const r = await refreshMenuText({ force: true });
        const st = menuTextStatus();
        const lines = [
            r.ok ? '✅ Refresh complete' : '❌ Refresh failed',
            `Slots filled: ${st.filled}/${st.total}`,
            r.error ? `Last error: ${r.error}` : '',
            st.sample ? `Sample morning greeting: ${st.sample}` : '',
        ].filter(Boolean);
        return reply(lines.join('\n'));
    });
