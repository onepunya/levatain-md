import { typing, getArgs, truncate, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';
import { checkPlugins, formatReport } from '../../src/lib/pluginCheck.js';

const MODES = ['full', 'code'];

export default plugin('cekplugin', 'checkplugin')
    .in('owner')
    .desc('Check every plugin: code errors, empty env keys, and API host health')
    .prefixOnly()
    .ownerOnly()
    .cooldown(30)
    .run(async (sock, {
        body,
        raw,
        from
    }) => {
        const args = getArgs(body).toLowerCase().split(/\s+/).filter(Boolean);
        const only = args.find(arg => !MODES.includes(arg)) || null;

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.plugin_check') }, { quoted: raw });

        try {
            const report = await checkPlugins({ only, probe: !args.includes('code') });
            const text   = formatReport(report, { full: args.includes('full') });
            await sock.sendMessage(from, { text: truncate(text, 3800) }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });
