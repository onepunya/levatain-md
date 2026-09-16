import { getStatus } from '../../src/lib/dashboard.js';
import { sendInlineWebUI } from '../../src/lib/rich-messages.js';
import { renderInfoCard, htmlEscape } from '../../src/lib/webui-templates.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('infobot')
  .in('main')
  .desc('Lihat info bot')
  .prefixOnly()
  .signal('User minta info bot', ['infobot', 'info bot'])
  .run(async (sock, { raw, from }) => {
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
        });

