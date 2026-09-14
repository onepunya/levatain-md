import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['deepvoice', 'deep'],
        tag:  'audiochanger',
        aliasOnly: true,
        desc: 'Deep Voice — suara jadi berat/dalam',
        ai: { trigger: 'deep voice', examples: ['deep voice audio ini'] },
        async run(sock, { message, raw, from }) {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.7,aresample=44100');
                await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'deepvoice.mp3' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

