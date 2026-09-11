import axios from 'axios';
import { toVoiceNoteOpus, typing } from '../../src/lib/utils.js';

const AUDIO_URL = 'https://github.com/onepunya/siswanda-fox_onepunya-/raw/refs/heads/main/mantep.mp3';

export const meta = {
    interface: {
        cmd:  ['ptttest', 'ptt'],
        tag:  'tools',
        aliasOnly: true,
        desc: 'Tes kirim PTT (voice note) dari link audio kostum',
        ai: {
            trigger:  'kirim ptt tes',
            examples: ['.ptttest', '.ptt'],
        },
        async run(sock, { from, raw }) {
            if (!AUDIO_URL || AUDIO_URL.includes('contoh.com')) {
                return sock.sendMessage(from, { text: '❌ Link audio belum diganti. Edit AUDIO_URL di plugins/tools/ptttest.js' }, { quoted: raw });
            }

            await typing(sock, from);
            try {
                const res = await axios.get(AUDIO_URL, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(res.data, 'binary');

                const ogg = await toVoiceNoteOpus(buffer);
                await sock.sendMessage(from, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal kirim PTT: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

