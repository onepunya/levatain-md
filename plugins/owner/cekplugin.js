import { getArgs, truncate } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';
import { checkPlugins, formatReport } from '../../src/tools/pluginCheck.js';

const MODES = ['full', 'code'];

export default plugin('cekplugin', 'checkplugin')
    .in('owner')
    .desc('Check every plugin: code errors, empty env keys, and API host health')
    .prefixOnly()
    .ownerOnly()
    .cooldown(30)
    .run(async (sock, { body, reply, typing }) => {
        const args = getArgs(body).toLowerCase().split(/\s+/).filter(Boolean);
        const only = args.find(arg => !MODES.includes(arg)) || null;

        await typing();
        await reply(msg('wait.plugin_check'));

        try {
            const report = await checkPlugins({ only, probe: !args.includes('code') });
            const text = formatReport(report, { full: args.includes('full') });
            await reply(truncate(text, 3800));
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
