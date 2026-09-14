import { getStatus } from '../../src/lib/dashboard.js';
import { sendInlineWebUI } from '../../src/lib/rich-messages.js';
import { renderInfoCard, htmlEscape } from '../../src/lib/webui-templates.js';

export const meta = {
    interface: {
        cmd: ['infobot'],
        tag: 'main',
        aliasOnly: true,
        desc: 'Lihat info bot',
        ai: {
            trigger: 'User minta info bot',
            examples: ['infobot', 'info bot'],
        },
        async run(sock, { raw, from }) {
            const s = getStatus();

            const rows = [
                ['Status', s.connected ? '<span class="ok">🟢 Connected</span>' : '<span class="bad">🔴 Disconnected</span>'],
                ['Uptime', htmlEscape(s.uptime)],
                ['Plugin', String(s.plugins)],
                ['Owner', htmlEscape(s.owner)],
                ['Total User', String(s.totalUsers)],
                ['Total Grup', String(s.totalGroups)],
                ['Total Command', String(s.totalCommands)],
                ['RAM', `${htmlEscape(s.memory)} MB (${htmlEscape(s.memPct)}%)`],
                ['Node', htmlEscape(s.server.nodeVer)],
                ['Platform', htmlEscape(s.server.platform)],
            ];

            const html = renderInfoCard({
                title: `🤖 ${s.botName}`,
                subtitle: 'Bot Info',
                rows,
                footer: 'Levatain-MD',
            });

            await sendInlineWebUI(sock, from, html, `${s.botName} — Info`);
        },
    },
};
