import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';

const LANGS = ['en', 'id'];

export default plugin('lang', 'language')
    .in('main')
    .desc('Set AI reply language for your account')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to change AI language or set language preference', [
        'set language english',
        'change language to indonesian',
        'lang en',
        'lang id',
    ])
    .run(async (sock, { body, raw, from, db, saveDb }) => {
        const arg = body.split(/\s+/).slice(1).join(' ').trim().toLowerCase();
        const current = (db?.lang === 'id' ? 'id' : 'en');

        if (!arg) {
            return sock.sendMessage(from, {
                text: msg('lang.current', { lang: current }) + '\n\n' + msg('lang.usage'),
            }, { quoted: raw });
        }

        if (!LANGS.includes(arg)) {
            return sock.sendMessage(from, { text: msg('lang.invalid') }, { quoted: raw });
        }

        if (db) {
            db.lang = arg;
            if (typeof saveDb === 'function') await saveDb();
        }

        return sock.sendMessage(from, { text: msg('lang.set', { lang: arg }) }, { quoted: raw });
    });
