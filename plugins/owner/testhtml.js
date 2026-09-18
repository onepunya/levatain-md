import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('testhtml', 'sendhtml')
    .in('owner')
    .desc('Send raw HTML/JS as a rich WebUI message (for testing). Owner only.')
    .prefixOnly()
    .ownerOnly()
    .signal('Owner asks to send/test raw HTML, custom JS, or HTML preview as rich webui', [
            'testhtml <h1>Hello</h1>',
            'send this html to webui: <button onclick="alert(1)">click</button>',
            'reply to a message with html then .testhtml',
        ])
    .run(async (sock, { raw, from, body, message, db, primaryId }) => {
        const _i18n = { db, primaryId };         
        let html = body.replace(/^\S+\s*/, '');

        if (!html.trim() && message.quoted?.text) {
            html = message.quoted.text;
        }

        if (!html.trim()) {
            return sock.sendMessage(from, {
                text: msg('need.html')
                    + 'Example: `.testhtml <h1>Hello</h1>`',
            }, { quoted: raw });
        }

        const bytes = Buffer.byteLength(html, 'utf-8');
        if (bytes > WEBUI_MAX_PAYLOAD_BYTES) {
            return sock.sendMessage(from, {
                text: `🛑 HTML too large (${(bytes / 1024).toFixed(1)}KB), safe limit ${(WEBUI_MAX_PAYLOAD_BYTES / 1024).toFixed(0)}KB.`,
            }, { quoted: raw });
        }

        try {
            await sendInlineWebUI(sock, from, html, 'Test HTML');
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.send', { msg: e.message }) }, { quoted: raw });
        }
    });

