export const meta = {
    cmd:  ['ping'],
    tag:  'main',
    aliasOnly: true,
    desc: 'Cek status dan kecepatan bot',
    ai: {
        trigger: 'User minta cek status bot, ping, atau latency',
        examples: ['ping', 'bot masih hidup?'],
    },
};

export async function run(sock, { raw, from }) {
    const start = Date.now();
    await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: raw });
    const latency = Date.now() - start;
    await sock.sendMessage(from, { text: `⚡ *${latency}ms*` }, { quoted: raw });
}
