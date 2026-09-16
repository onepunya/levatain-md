import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('vaporwave')
  .in('audiochanger')
  .desc('Vaporwave — lambat, aesthetic, dikit reverb')
  .prefixOnly()
  .signal('vaporwave', ['vaporwave audio ini'])
  .run(async (sock, { message, raw, from }) => {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, 'asetrate=44100*0.8,aresample=44100,atempo=0.9,bass=g=6');
                await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'vaporwave.mp3' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        });

