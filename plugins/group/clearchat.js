import { plugin } from '../../src/core/plugin.js';
export default plugin('clearchat', 'cleargc')
  .in('group')
  .desc('Bersihkan riwayat chat group (khusus tampilan admin)')
  .prefixOnly()
  .adminOnly()
  .groupOnly()
  .signal('User minta bersihkan/hapus riwayat obrolan group', ['clearchat', 'bersihkan chat group ini'])
  .run(async (sock, { raw, from }) => {
            try {
                await sock.chatModify({
                    clear: { messages: [{ id: raw.key.id, fromMe: Boolean(raw.key.fromMe), timestamp: raw.messageTimestamp }] },
                }, from);
                await sock.sendMessage(from, { text: '🧹 Riwayat chat group berhasil dibersihkan (di sisi bot).' }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal membersihkan chat: ${e.message}` }, { quoted: raw });
            }
        });

