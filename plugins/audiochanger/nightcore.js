import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['nightcore'],
        tag:  'audiochanger',
        aliasOnly: true,
        desc: 'Nightcore — audio dipercepat + nada dinaikin',
        ai: { trigger: 'nightcore', examples: ['nightcore audio ini'] },
        async run(sock, { message, raw, from }) {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, 'asetrate=44100*1.3,aresample=44100');
                await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'nightcore.mp3' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

