import { getArgs } from '../../src/lib/utils.js';
import { saveDb } from '../../src/core/db.js';

export const meta = {
    cmd:  ['afk'],
    tag:  'group',
    aliasOnly: true,
    desc: 'Set status AFK, bot bakal kasih tau kalau kamu di-tag/reply',
    ai: {
        trigger: 'User mau set status AFK atau sedang tidak aktif',
        examples: ['afk lagi makan', 'afk', 'afk sholat dulu'],
        args: { alasan: 'Alasan AFK (opsional)' },
    },
};

export async function run(sock, { body, raw, from, primaryId, gdb, isGroup }) {
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
}
