import { applyAudioFilter, downloadMedia, typing } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('bassboost', 'bass')
  .in('audiochanger')
  .desc('Bass Boost — bass audio dinaikin biar nendang')
  .prefixOnly()
  .signal('bass boost', ['bass boost audio ini'])
  .run(async (sock, { message, raw, from }) => {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: '❌ Kirim atau reply audio/video dulu.' }, { quoted: raw });

            await typing(sock, from);
            try {
                const out = await applyAudioFilter(result.buffer, 'bass=g=20:f=110:w=0.6');
                await sock.sendMessage(from, { audio: out, mimetype: 'audio/mpeg', fileName: 'bassboost.mp3' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal proses audio: ${e.message}` }, { quoted: raw });
            }
        });

