import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['robot'],
        tag:  'audiochanger',
        aliasOnly: true,
        desc: 'Robot Voice — suara jadi kayak robot',
        ai: { trigger: 'robot voice', examples: ['robot voice audio ini'] },
        async run(sock, { message, raw, from }) {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, FILTER);
                await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'robot.mp3' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

const FILTER = "afftfilt=real='hypot(re,im)*cos(0.05*n)':imag='hypot(re,im)*sin(0.05*n)':win_size=512:overlap=0.75";

