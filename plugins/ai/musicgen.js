import { startSession, updateSession, endSession, generateSong, ProgressMessage, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

const SESSION_TIMEOUT = 3 * 60_000;

export default plugin('musicgen', 'songgen', 'buatlagu')
    .in('ai')
    .desc('Generate AI song: enter lyrics then music style/prompt step by step')
    .prefixOnly()
    .cooldown(5)
    .signal('User asks to generate a song or AI music from lyrics', ['musicgen', 'buatlagu'])
    .run(async (sock, { raw, from, primaryId, db }) => {
        startSession(primaryId, { from, step: 'lyrics', lyrics: '', prompt: '' }, {
            timeout: SESSION_TIMEOUT,
            onInput: handleInput,
            onTimeout: session => sock.sendMessage(session.from, {
                text: msg('fail.session_timeout') + ' Type `musicgen` again to restart.',
            }),
        });

        await sock.sendMessage(from, {
            text: msg('need.lyrics_now'),
        }, { quoted: raw });
    });

async function handleInput(sock, body, ctx, session) {
    const { from, raw, primaryId } = ctx;
    const text = body.trim();

    if (session.step === 'lyrics') {
        if (!text) return sock.sendMessage(from, { text: msg('need.lyrics') }, { quoted: raw });
        updateSession(primaryId, { step: 'prompt', lyrics: text });
        return sock.sendMessage(from, {
            text: '🎨 Now send the *music style/prompt*.\nExample: cheerful acoustic pop, chill lofi, energetic rock.',
        }, { quoted: raw });
    }

    if (session.step === 'prompt') {
        if (!text) return sock.sendMessage(from, { text: msg('need.prompt') }, { quoted: raw });
        const lyrics = session.lyrics;
        endSession(primaryId);
        await sock.sendMessage(from, { text: msg('wait.musicgen') }, { quoted: raw });
        await generateMusic(sock, from, raw, lyrics, text);
    }
}

async function generateMusic(sock, from, raw, lyrics, prompt) {
    const bar = new ProgressMessage(sock, from, raw);
    await bar.start('🎼 Sending song generation request...');

    try {
        const result = await generateSong({ caption: prompt, lyrics }, percent => bar.update('🎧 Generating song...', percent));

        await bar.done('✅ Song ready, sending...');

        const audioRes = await fetch(result.url);
        if (!audioRes.ok) throw new Error(`Failed to fetch audio file (HTTP ${audioRes.status})`);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: 'musicgen.mp3',
            ptt: false,
        }, { quoted: raw });
    } catch (e) {
        await bar.fail(msg('fail.generic', { msg: e.message }));
    }
}
