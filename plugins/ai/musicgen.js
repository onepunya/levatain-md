import { generateSong } from '../../src/api/index.js';
import { startSession, updateSession, endSession, ProgressMessage, msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

const SESSION_TIMEOUT = 3 * 60_000;

export default plugin('musicgen', 'songgen', 'buatlagu')
    .in('ai')
    .desc('Generate AI song: enter lyrics then music style/prompt step by step')
    .prefixOnly()
    .cooldown(5)
    .signal('User asks to generate a song or AI music from lyrics', ['musicgen', 'buatlagu'])
    .run(async (sock, { from, primaryId, reply, send }) => {
        startSession(primaryId, { from, step: 'lyrics', lyrics: '', prompt: '' }, {
            timeout: SESSION_TIMEOUT,
            onInput: handleInput,
            onTimeout: () => send(msg('fail.session_timeout') + ' Type `musicgen` again to restart.'),
        });

        await reply(msg('need.lyrics_now'));
    });

async function handleInput(sock, body, ctx, session) {
    const { from, raw, primaryId, reply } = ctx;
    const text = body.trim();

    if (session.step === 'lyrics') {
        if (!text) return reply(msg('need.lyrics'));
        updateSession(primaryId, { step: 'prompt', lyrics: text });
        return reply('🎨 Now send the *music style/prompt*.\nExample: cheerful acoustic pop, chill lofi, energetic rock.');
    }

    if (session.step === 'prompt') {
        if (!text) return reply(msg('need.prompt'));
        const lyrics = session.lyrics;
        endSession(primaryId);
        await reply(msg('wait.musicgen'));
        await generateMusic(sock, ctx, lyrics, text);
    }
}

async function generateMusic(sock, { from, raw, reply }, lyrics, prompt) {
    const bar = new ProgressMessage(sock, from, raw);
    await bar.start('🎼 Sending song generation request...');

    try {
        const result = await generateSong({ caption: prompt, lyrics }, percent => bar.update('🎧 Generating song...', percent));

        await bar.done('✅ Song ready, sending...');

        const urls = result.urls?.length ? result.urls : [result.url];
        for (let i = 0; i < urls.length; i++) {
            const audioRes = await fetch(urls[i]);
            if (!audioRes.ok) throw new Error(`Failed to fetch audio file (HTTP ${audioRes.status})`);
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

            const trackTitle = result.tracks?.[i]?.title || result.title || 'AI Song';
            const suffix = urls.length > 1 ? ` (${i + 1}/${urls.length})` : '';

            await reply({
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${trackTitle}${suffix}.mp3`.replace(/[^\w.\- ()]/g, '_').slice(0, 80),
                ptt: false,
            });
        }
    } catch (e) {
        await bar.fail(msg('fail.generic', { msg: e.message }));
    }
}
