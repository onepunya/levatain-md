export const meta = {
    interface: {
        cmd:  ['tembak', 'lamar', 'terima', 'tolak'],
        tag:  'fun',
        aliasOnly: false,
        isGroup: true,
        cooldown: 10,
        desc: 'Nembak/lamar orang di group, dia bisa .terima atau .tolak',
        ai: {
            trigger: 'User mau nembak, nyatain perasaan, atau lamar orang lain di group',
            examples: ['tembak @user', 'lamar @user aku suka kamu', 'terima', 'tolak'],
        },
        async run(sock, { raw, from, command, message, mentionedJid, primaryId, pushname, botNumber, gdb }) {
            const nameOf = (jid, fallbackName) => gdb?.users?.[jid]?.name || fallbackName || `+${jid.split('@')[0]}`;

            if (command === 'terima' || command === 'tolak') {
                const key = `${from}:${primaryId}`;
                const entry = pending.get(key);
                if (!entry) {
                    return sock.sendMessage(from, { text: '❓ Gak ada yang lagi nembak kamu di sini.' }, { quoted: raw });
                }

                clearTimeout(entry.timer);
                pending.delete(key);

                const accepted   = command === 'terima';
                const quote      = pick(accepted ? DITERIMA : DITOLAK);
                const targetName = nameOf(primaryId, pushname);
                const fromName   = nameOf(entry.fromId);

                return sock.sendMessage(from, {
                    text: `${accepted ? '💌' : '💔'} *${targetName}* ${accepted ? 'menerima' : 'menolak'} tembakan dari *${fromName}*!\n\n_${quote}_`,
                    mentions: [primaryId, entry.fromId],
                }, { quoted: raw });
            }

            const target = resolveTarget(message, mentionedJid);
            if (!target) {
                return sock.sendMessage(from, { text: `❌ Tag atau reply orang yang mau kamu ${command} dulu.\nContoh: *.${command} @orangnya*` }, { quoted: raw });
            }
            if (target.split('@')[0] === primaryId.split('@')[0]) {
                return sock.sendMessage(from, { text: '❌ Gak bisa nembak diri sendiri, wak. 😅' }, { quoted: raw });
            }
            if (botNumber && target.split('@')[0] === botNumber.split('@')[0]) {
                return sock.sendMessage(from, { text: '🤖 Aku bot, gak bisa dilamar... tapi makasih ya. 😄' }, { quoted: raw });
            }

            const key = `${from}:${target}`;
            if (pending.has(key)) {
                return sock.sendMessage(from, { text: '⏳ Masih ada yang nembak dia duluan, tunggu proposal itu selesai dulu.' }, { quoted: raw });
            }

            const targetName = nameOf(target);
            const fromName   = pushname || 'Seseorang';

            const timer = setTimeout(async () => {
                if (!pending.has(key)) return;
                pending.delete(key);
                try {
                    await sock.sendMessage(from, {
                        text: `⌛ *${targetName}* gak jawab tembakan dari *${fromName}*...\n\n_${pick(TIDAK_DIJAWAB)}_`,
                        mentions: [target, primaryId],
                    });
                } catch {}
            }, TIMEOUT_MS);

            pending.set(key, { fromId: primaryId, timer });

            await sock.sendMessage(from, {
                text:
                    `💘 *${fromName}* mau ${command} *${targetName}*!\n\n` +
                    `_${pick(PEMBUKA)}_\n\n` +
                    `*${targetName}*, balas dalam 5 menit:\n` +
                    `• *.terima* — kalau kamu juga suka\n` +
                    `• *.tolak* — kalau enggak`,
                mentions: [target, primaryId],
            }, { quoted: raw });
        },
    },
};

const pending = new Map();
const TIMEOUT_MS = 5 * 60_000;

const PEMBUKA = [
    'Katanya, keberanian terbesar bukan waktu gak takut jatuh cinta, tapi waktu berani bilang meski takut ditolak.',
    'Cinta itu kayak angin — gak keliatan, tapi kerasa. Dan sekarang dia mau kasih tau kalau dia ngerasain itu ke kamu.',
    'Ada yang bilang, penyesalan terbesar bukan karena mencoba, tapi karena gak pernah mencoba sama sekali. Jadi dia coba sekarang.',
    'Hati yang jujur gak butuh kata-kata indah, cuma butuh keberanian buat diungkapin. Dan ini dia, keberanian itu.',
];

const DITERIMA = [
    'Dua hati yang jujur akhirnya ketemu di jalan yang sama. Selamat menempuh babak baru. 💞',
    'Katanya, cinta yang tumbuh dari kejujuran akan selalu punya tempat untuk bertahan. Semoga langgeng. 💞',
    'Kadang yang dibutuhkan cuma satu keberanian dan satu jawaban "iya" untuk mengubah cerita. Selamat! 💞',
];

const DITOLAK = [
    'Tidak semua yang dirasa harus berbalas, dan itu bukan akhir dari apa pun — cuma jalan yang beda. Tetap semangat. 🤍',
    'Ditolak bukan berarti gak berharga, cuma berarti belum waktunya, atau bukan orangnya. Terima kasih sudah berani jujur. 🤍',
    'Keberanian buat ngungkapin perasaan itu udah menang duluan, apa pun jawabannya. Semangat terus. 🤍',
];

const TIDAK_DIJAWAB = [
    'Ada pertanyaan yang gak selalu butuh jawaban untuk dimengerti. Sunyinya udah cukup jadi jawaban. 🕊️',
    'Kadang diam itu sendiri sudah bicara. Gak apa-apa, gak semua perasaan harus berujung kepastian. 🕊️',
    'Waktu habis, jawaban gak datang — tapi keberanian buat jujur tadi tetap patut dihargai. 🕊️',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function resolveTarget(message, mentionedJid) {
    if (message?.quoted) {
        const s = message.quoted.sender.replace(/@.*/, '').split(':')[0];
        return message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
    }
    if (mentionedJid?.[0]) return mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
    return null;
}

