import { saveDb } from '../../src/core/db.js';
import { getArgs } from '../../src/lib/utils.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('mode')
  .in('owner')
  .desc('Ganti mode bot: public (semua chat), group (khusus di dalam group), private (khusus owner)')
  .prefixOnly()
  .ownerOnly()
  .run(async (sock, { body, raw, from, gdb }) => {
            const arg = getArgs(body).toLowerCase();

            if (!arg || !VALID.includes(arg)) {
                const current = gdb.settings.mode || 'public';
                return sock.sendMessage(from, {
                    text: `*Mode bot saat ini:*\n${LABELS[current]}\n\n`
                        + `Ganti dengan:\n`
                        + `• .mode public\n`
                        + `• .mode group\n`
                        + `• .mode private`,
                }, { quoted: raw });
            }

            gdb.settings.mode = arg;
            await saveDb();
            return sock.sendMessage(from, { text: `✅ Mode bot diganti ke:\n${LABELS[arg]}` }, { quoted: raw });
        });

const VALID  = ['public', 'group', 'private'];
const LABELS = {
    public:  '🌐 *Public* — bot merespon di semua chat (DM & group)',
    group:   '👥 *Group Only* — bot cuma merespon di dalam group',
    private: '🔒 *Private* — bot cuma merespon owner',
};

