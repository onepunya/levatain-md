import { getArgs } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tagadmin')
  .in('group')
  .desc('Tag semua admin group')
  .prefixOnly()
  .groupOnly()
  .cooldown(10)
  .ai({
            trigger: 'User minta tag/panggil semua admin group',
            examples: ['tagadmin tolong dicek', 'panggil semua admin'],
            args: { text: 'Pesan yang ingin dikirim' },
        })
  .run(async (sock, { body, raw, from, admins }) => {
            if (!admins?.length) return sock.sendMessage(from, { text: '❌ Tidak ada admin terdeteksi di group ini.' }, { quoted: raw });

            const text = getArgs(body) || '📢 Memanggil semua admin!';
            const list = admins.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n');

            await sock.sendMessage(from, {
                text: `${text}\n\n${list}`,
                mentions: admins,
            }, { quoted: raw });
        });

