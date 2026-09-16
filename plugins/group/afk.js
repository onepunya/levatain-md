import { getArgs } from '../../src/lib/utils.js';
import { saveDb } from '../../src/core/db.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('afk')
  .in('group')
  .desc('Set status AFK, bot bakal kasih tau kalau kamu di-tag/reply')
  .prefixOnly()
  .ai({
            trigger: 'User mau set status AFK atau sedang tidak aktif',
            examples: ['afk lagi makan', 'afk', 'afk sholat dulu'],
            args: { alasan: 'Alasan AFK (opsional)' },
        })
  .run(async (sock, { body, raw, from, primaryId, gdb, isGroup }) => {
            if (!isGroup) return sock.sendMessage(from, { text: '👥 Fitur ini cuma bisa dipakai di group.' }, { quoted: raw });

            const reason = getArgs(body) || '';
            const grp    = gdb.groups[from];
            grp.afk[primaryId] = { since: Date.now(), reason };
            await saveDb();

            const tag = primaryId.split('@')[0];
            await sock.sendMessage(from, {
                text: `┌───「 *STATUS AFK AKTIF* 」\n├ *User:* @${tag}\n├ *Alasan:* ${reason || 'Tidak ada alasan'}\n└ _Bot akan memberi tahu jika ada yang menyebutmu._`,
                mentions: [primaryId],
            }, { quoted: raw });
        });

