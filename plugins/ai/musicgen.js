import { startSession, updateSession, endSession } from '../../src/lib/session.js';
import { generateSong } from '../../src/lib/boppy.js';
import { ProgressMessage } from '../../src/lib/progress.js';

const SESSION_TIMEOUT = 3 * 60_000;

export const meta = {
    interface: {
        cmd:      ['musicgen', 'songgen', 'buatlagu'],
        tag:      'ai',
        aliasOnly: true,
        desc:     'Generate lagu AI: masukin lirik lalu prompt/gaya musik secara bertahap',
        cooldown: 5,
        ai: {
            trigger: 'User minta buat lagu, generate musik AI, bikin musik dari lirik',
            examples: ['musicgen', 'buatlagu'],
        },
        async run(sock, { raw, from, primaryId }) {
            startSession(primaryId, { from, step: 'lyrics', lyrics: '', prompt: '' }, {
                timeout: SESSION_TIMEOUT,
                onInput: handleInput,
                onTimeout: session => sock.sendMessage(session.from, {
                    text: '⏰ Sesi musicgen berakhir karena kelamaan gak ada input. Ketik `musicgen` lagi buat mulai ulang.',
                }),
            });

            await sock.sendMessage(from, {
                text: '🎵 Kirim *lirik* lagunya sekarang.\n\nKetik `batal` kapan aja buat keluar dari sesi ini.',
            }, { quoted: raw });
        },
    },
};

async function handleInput(sock, body, ctx, session) {
    const { from, raw, primaryId } = ctx;
    const text = body.trim();

    if (session.step === 'lyrics') {
        if (!text) return sock.sendMessage(from, { text: '❌ Lirik gak boleh kosong, kirim lagi.' }, { quoted: raw });
        updateSession(primaryId, { step: 'prompt', lyrics: text });
        return sock.sendMessage(from, {
            text: '🎨 Sekarang kirim *prompt/gaya musiknya*.\nContoh: pop akustik ceria, lofi santai, rock energik.',
        }, { quoted: raw });
    }

    if (session.step === 'prompt') {
        if (!text) return sock.sendMessage(from, { text: '❌ Prompt gak boleh kosong, kirim lagi.' }, { quoted: raw });
        const lyrics = session.lyrics;
        endSession(primaryId);
        await sock.sendMessage(from, { text: '⏳ Generate lagu, tunggu bentar...' }, { quoted: raw });
        await generateMusic(sock, from, raw, lyrics, text);
    }
}

async function generateMusic(sock, from, raw, lyrics, prompt) {
    const bar = new ProgressMessage(sock, from, raw);
    await bar.start('🎼 Mengirim permintaan generate lagu...');

    try {
        const result = await generateSong({ caption: prompt, lyrics }, percent => bar.update('🎧 Generate lagu...', percent));

        await bar.done('✅ Lagu selesai dibuat, mengirim...');

        const audioRes = await fetch(result.url);
        if (!audioRes.ok) throw new Error(`Gagal ambil file audio (HTTP ${audioRes.status})`);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: 'musicgen.mp3',
            ptt: false,
        }, { quoted: raw });
    } catch (e) {
        await bar.fail(`Gagal generate lagu: ${e.message}`);
    }
}
