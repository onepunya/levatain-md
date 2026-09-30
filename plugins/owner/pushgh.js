import { plugin } from '../../src/core/plugin.js';
import { syncProjectToGithub, isGithubSyncEnabled, ProgressMessage, msg } from '../../src/lib/index.js';

export default plugin('pushgh', 'deploy')
    .in('owner')
    .desc('Push seluruh source code bot ke repo GitHub public (skip .env, node_modules, session, dll)')
    .showAllAliases()
    .ownerOnly()
    .ai({
        trigger: 'Owner asks to push/deploy/sync the bot source code to GitHub',
        examples: ['pushgh', 'deploy ke github', 'sync code ke repo'],
    })
    .run(async (sock, {
        body,
        raw,
        from
    }) => {
        if (!isGithubSyncEnabled()) {
            return sock.sendMessage(from, { text: msg('fail.github_not_configured') }, { quoted: raw });
        }

        const note = body.split(/\s+/).slice(1).join(' ').trim();
        const bar = new ProgressMessage(sock, from, raw);
        await bar.start(msg('wait.github_push'));

        try {
            const result = await syncProjectToGithub({
                commitMessage: note || undefined,
                onProgress: text => bar.stage(text),
            });

            await bar.done(msg('done.github_push', { count: result.filesCount, url: result.commitUrl }));
        } catch (e) {
            await bar.fail(msg('fail.github_push', { msg: e.message }));
        }
    });
