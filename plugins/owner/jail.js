import { plugin } from '../../src/core/plugin.js';
import { setEnabled, setTarget, getConfig } from '../../src/core/praiseGate.js';
import { saveDb } from '../../src/core/db.js';

export default plugin('jail')
    .in('owner')
    .desc('Atur gerbang pujian: .jail on | off | set <nomor> | status')
    .ownerOnly()
    .run(async (sock, { body, reply }) => {
        const [, sub, arg] = body.trim().split(/\s+/);
        const s = (sub || 'status').toLowerCase();

        if (s === 'on' || s === 'off') setEnabled(s === 'on');
        else if (s === 'set' && arg) setTarget(arg);
        else if (s !== 'status') return reply('Pakai: .jail on | off | set <nomor> | status');

        await saveDb();
        const c = getConfig();
        return reply(`🔒 Gerbang pujian: *${c.enabled ? 'AKTIF' : 'MATI'}*\nTarget: ${c.target}`);
    });
