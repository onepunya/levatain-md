import { saveDb } from '../../src/core/db.js';
import {  getArgs, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('mode')
    .in('owner')
    .desc('Set bot mode: public (all chats), group (groups only), private (owner only)')
    .prefixOnly()
    .ownerOnly()
    .run(async (sock, { body, raw, from, gdb }) => {
        const arg = getArgs(body).toLowerCase();

        if (!arg || !VALID.includes(arg)) {
            const current = gdb.settings.mode || 'public';
            return sock.sendMessage(from, {
                text: `*Current bot mode:*\n${LABELS[current]}\n\n`
                    + `Change with:\n`
                    + `• .mode public\n`
                    + `• .mode group\n`
                    + `• .mode private`,
            }, { quoted: raw });
        }

        gdb.settings.mode = arg;
        await saveDb();
        return sock.sendMessage(from, { text: msg('done.mode_set', { mode: LABELS[arg] }) }, { quoted: raw });
    });

const VALID  = ['public', 'group', 'private'];
const LABELS = {
    public:  '🌐 *Public* — bot responds to all chats (DM & group)',
    group:   '👥 *Group Only* — bot only responds in groups',
    private: '🔒 *Private* — bot only responds to the owner',
};

