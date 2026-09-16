import { sendInlineWebUI, WEBUI_MAX_PAYLOAD_BYTES } from '../../src/lib/rich-messages.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('testhtml', 'sendhtml')
    .in('owner')
    .desc('Kirim kode HTML/JS mentah sebagai rich WebUI message (buat testing). Owner only.')
    .prefixOnly()
    .ownerOnly()
    .signal('Owner minta kirim/test kode HTML mentah, JS custom, atau preview HTML ke rich webui', [
            'testhtml <h1>Halo</h1>',
            'kirim html ini ke webui: <button onclick="alert(1)">klik</button>',
            'balas pesan berisi kode html terus .testhtml',
        ])
    .run(async (sock, { raw, from, body, message }) => {         
        let html = body.replace(/^\S+\s*/, '');

        if (!html.trim() && message.quoted?.text) {
            html = message.quoted.text;
        }

        if (!html.trim()) {
            return sock.sendMessage(from, {
                text: '📝 Kirim kode HTML setelah command, atau balas pesan yang isinya kode HTML.\n\n'
                    + 'Contoh: `.testhtml <h1>Halo</h1>`',
            }, { quoted: raw });
        }

        const bytes = Buffer.byteLength(html, 'utf-8');
        if (bytes > WEBUI_MAX_PAYLOAD_BYTES) {
            return sock.sendMessage(from, {
                text: `🛑 HTML kepanjangan (${(bytes / 1024).toFixed(1)}KB), batas aman ${(WEBUI_MAX_PAYLOAD_BYTES / 1024).toFixed(0)}KB.`,
            }, { quoted: raw });
        }

        try {
            await sendInlineWebUI(sock, from, html, 'Test HTML');
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal kirim: ${e.message}` }, { quoted: raw });
        }
    });

