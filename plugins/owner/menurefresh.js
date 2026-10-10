import { plugin } from '../../src/core/plugin.js';
import { refreshMenuText, ensureMenuText, menuTextStatus } from '../../src/menu/menuText.js';

ensureMenuText();

export default plugin('menurefresh', 'menutext')
    .in('owner')
    .desc('Force regenerate menu text via LLM and show status')
    .prefixOnly()
    .ownerOnly()
    .run(async (sock, { raw, from }) => {
        await sock.sendMessage(from, { text: '⏳ Generating menu text via LLM...' }, { quoted: raw });
        const r = await refreshMenuText({ force: true });
        const st = menuTextStatus();
        const lines = [
            r.ok ? '✅ Refresh complete' : '❌ Refresh failed',
            `Slots filled: ${st.filled}/${st.total}`,
            r.error ? `Last error: ${r.error}` : '',
            st.sample ? `Sample morning greeting: ${st.sample}` : '',
        ].filter(Boolean);
        return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: raw });
    });
