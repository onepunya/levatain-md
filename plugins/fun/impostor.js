export const meta = {
    cmd:  ['impostor', 'wordwolf'],
    tag:  'fun',
    aliasOnly: true,
    desc: 'Game tebak impostor kata (Word Wolf) — semua dapet kata sama kecuali 1 impostor',
    ai: {
        trigger: 'User mau main game impostor kata / word wolf / tebak siapa yang beda katanya di grup, atau mau cek kata rahasianya sendiri',
        examples: [
            'impostor buat',
            'impostor gabung',
            'impostor mulai',
            'impostor vote @orang',
            'impostor status',
            'impostor kata',
        ],
        args: { text: 'Subcommand: buat, gabung, mulai, vote, status, batal, kata' },
    },
};

const GROUP_ONLY_SUBS = new Set(['buat', 'create', 'gabung', 'join', 'mulai', 'start', 'vote', 'batal', 'stop', 'cancel', 'status']);

const WORD_PAIRS = [
    ['Kucing', 'Anjing'],
    ['Kopi', 'Teh'],
    ['Nasi Goreng', 'Mie Goreng'],
    ['Hujan', 'Gerimis'],
    ['Guru', 'Dosen'],
    ['Handphone', 'Tablet'],
    ['Motor', 'Sepeda'],
    ['Bakso', 'Mie Ayam'],
    ['Dokter', 'Perawat'],
    ['Kereta', 'Bus'],
    ['Gitar', 'Ukulele'],
    ['Ayam Goreng', 'Ayam Bakar'],
    ['Sungai', 'Danau'],
    ['Kucing', 'Harimau'],
    ['Roti', 'Kue'],
    ['Laptop', 'Komputer'],
    ['Pantai', 'Laut'],
    ['Sepatu', 'Sandal'],
    ['Landak', 'Kelinci'],
    ['Es Krim', 'Es Cendol'],
    ['Kipas Angin', 'AC'],
    ['Payung', 'Jas Hujan'],
    ['Gunung', 'Bukit'],
    ['Dompet', 'Tas'],
    ['Kucing', 'Kelinci'],
];

const DISKUSI_MS = 3 * 60_000;
const VOTE_MS    = 2 * 60_000;

const games = new Map();

const pick   = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

function nameOf(gdb, id, fallback) {
    return gdb?.users?.[id]?.name || fallback || `+${id.split('@')[0]}`;
}

function isSamePerson(primaryId, playerId, gdb) {
    if (playerId === primaryId) return true;
    const rec = gdb?.users?.[playerId];
    if (rec?.jid === primaryId || rec?.lid === primaryId) return true;
    const recSelf = gdb?.users?.[primaryId];
    if (recSelf?.jid === playerId || recSelf?.lid === playerId) return true;
    return false;
}

function clearTimers(game) {
    if (game.timer) clearTimeout(game.timer);
    game.timer = null;
}

function resetGame(from) {
    const game = games.get(from);
    if (game) clearTimers(game);
    games.delete(from);
}

async function revealAndEnd(sock, from, game, resultText) {
    clearTimers(game);

    const list = game.players
        .map(p => `${p.isImpostor ? '🕵️' : '🙂'} ${p.name} — _${p.word}_`)
        .join('\n');

    await sock.sendMessage(from, {
        text: `${resultText}\n\n📜 *Pembongkaran:*\n${list}\n\nKata mayoritas: *${game.majorityWord}*\nKata impostor: *${game.impostorWord}*\n\nKetik *.impostor buat* buat main lagi.`,
        mentions: game.players.map(p => p.id),
    });

    games.delete(from);
}

async function startVotingPhase(sock, from) {
    const game = games.get(from);
    if (!game || game.status !== 'diskusi') return;

    game.status = 'voting';
    game.votes  = {};
    clearTimers(game);

    await sock.sendMessage(from, {
        text:
            `🗳️ *Waktu diskusi habis! Saatnya voting.*\n\n` +
            `Ketik *.impostor vote @orang* buat nunjuk siapa yang menurut kamu impostor.\n` +
            `Voting otomatis ditutup dalam 2 menit atau kalau semua udah vote.`,
        mentions: game.players.map(p => p.id),
    });

    game.timer = setTimeout(() => finalizeVote(sock, from), VOTE_MS);
}

async function finalizeVote(sock, from) {
    const game = games.get(from);
    if (!game || game.status !== 'voting') return;

    const tally = {};
    for (const target of Object.values(game.votes)) {
        tally[target] = (tally[target] || 0) + 1;
    }

    const entries = Object.entries(tally);
    if (entries.length === 0) {
        return revealAndEnd(sock, from, game, `😶 *Gak ada yang vote sama sekali.* Impostor menang secara default!`);
    }

    entries.sort((a, b) => b[1] - a[1]);
    const topVotes = entries[0][1];
    const topTargets = entries.filter(([, v]) => v === topVotes).map(([id]) => id);

    if (topTargets.length > 1) {
        return revealAndEnd(sock, from, game, `🤝 *Hasil vote seri!* Gak ada yang keluar. Impostor menang secara default!`);
    }

    const eliminatedId = topTargets[0];
    const eliminated   = game.players.find(p => p.id === eliminatedId);

    if (eliminated?.isImpostor) {
        return revealAndEnd(sock, from, game, `🎉 *${eliminated.name}* kena vote dan ternyata dia IMPOSTOR-nya!\n\n*Warga menang!* 👏`);
    } else {
        return revealAndEnd(sock, from, game, `😈 *${eliminated?.name || '???'}* kena vote, tapi dia BUKAN impostor!\n\n*Impostor menang!*`);
    }
}

export async function run(sock, { body, raw, from, primaryId, pushname, gdb, mentionedJid, isOwner, isGroup }) {
    const args = body.trim().split(/\s+/);
    const sub  = (args[1] || '').toLowerCase();

    const myName = pushname || nameOf(gdb, primaryId);

    if (sub === 'kata' || sub === 'mykata' || sub === 'cek') {
        if (isGroup) {
            return sock.sendMessage(from, {
                text: `🤫 Demi kerahasiaan, chat aku pribadi (DM) terus ketik *.impostor kata* di sana, ${myName}.`,
            }, { quoted: raw });
        }

        const found = [];
        for (const g of games.values()) {
            if (g.status !== 'diskusi' && g.status !== 'voting') continue;
            const p = g.players.find(pl => isSamePerson(primaryId, pl.id, gdb));
            if (p) found.push(p);
        }

        if (!found.length) {
            return sock.sendMessage(from, {
                text: '❓ Gak nemu game aktif yang kamu ikutin. Kalau baru gabung, pastiin kamu udah pernah kirim pesan apapun di grupnya dulu.',
            }, { quoted: raw });
        }

        const text = found.map(p => `🕵️ Kata rahasia kamu: *${p.word}*`).join('\n\n');
        return sock.sendMessage(from, { text }, { quoted: raw });
    }

    if (GROUP_ONLY_SUBS.has(sub) && !isGroup) {
        return sock.sendMessage(from, { text: '👥 Command ini cuma bisa dipakai di grup.' }, { quoted: raw });
    }

    const game = games.get(from);

    if (!sub || sub === 'help' || sub === 'menu') {
        return sock.sendMessage(from, {
            text:
                `🕵️ *IMPOSTOR KATA (Word Wolf)*\n\n` +
                `*.impostor buat* — buat lobi baru\n` +
                `*.impostor gabung* — gabung ke lobi\n` +
                `*.impostor mulai* — mulai game (host, min. 3 orang)\n` +
                `*.impostor vote @orang* — vote pas fase voting\n` +
                `*.impostor status* — cek status game\n` +
                `*.impostor batal* — batalin game (host/owner)\n` +
                `*.impostor kata* — cek kata rahasia kamu (WAJIB di DM bot)\n\n` +
                `_Cara main: semua dapet kata sama, kecuali 1 impostor yang dapet kata beda. Ambil katamu dengan DM bot ini duluan lalu ketik .impostor kata. Diskusi tanpa nyebut kata langsung, lalu vote siapa yang dicurigai jadi impostor._`,
        }, { quoted: raw });
    }

    if (sub === 'status') {
        if (!game) return sock.sendMessage(from, { text: 'ℹ️ Gak ada game yang lagi jalan. Ketik *.impostor buat* buat mulai.' }, { quoted: raw });
        const names = game.players.map(p => p.name).join(', ');
        return sock.sendMessage(from, {
            text: `ℹ️ Status: *${game.status}*\nPemain (${game.players.length}): ${names}`,
        }, { quoted: raw });
    }

    if (sub === 'batal' || sub === 'stop' || sub === 'cancel') {
        if (!game) return sock.sendMessage(from, { text: '❌ Gak ada game yang lagi jalan.' }, { quoted: raw });
        if (game.hostId !== primaryId && !isOwner) {
            return sock.sendMessage(from, { text: '❌ Cuma host atau owner yang bisa batalin game ini.' }, { quoted: raw });
        }
        resetGame(from);
        return sock.sendMessage(from, { text: '🛑 Game dibatalin.' }, { quoted: raw });
    }

    if (sub === 'buat' || sub === 'create') {
        if (game) return sock.sendMessage(from, { text: `❌ Udah ada game yang lagi *${game.status}* di grup ini. Ketik *.impostor batal* dulu kalau mau reset.` }, { quoted: raw });

        games.set(from, {
            status:  'lobby',
            hostId:  primaryId,
            players: [{ id: primaryId, name: myName }],
            votes:   {},
            timer:   null,
        });

        return sock.sendMessage(from, {
            text:
                `🕵️ *Lobi Impostor Kata dibuat oleh ${myName}!*\n\n` +
                `Ketik *.impostor gabung* buat ikutan.\n` +
                `Minimal 3 orang, host ketik *.impostor mulai* kalau udah siap.`,
        }, { quoted: raw });
    }

    if (!game) {
        return sock.sendMessage(from, { text: '❌ Belum ada lobi. Ketik *.impostor buat* dulu.' }, { quoted: raw });
    }

    if (sub === 'gabung' || sub === 'join') {
        if (game.status !== 'lobby') return sock.sendMessage(from, { text: '❌ Game udah dimulai, gak bisa gabung lagi.' }, { quoted: raw });
        if (game.players.some(p => p.id === primaryId)) return sock.sendMessage(from, { text: '✅ Kamu udah ada di lobi.' }, { quoted: raw });

        game.players.push({ id: primaryId, name: myName });
        return sock.sendMessage(from, {
            text: `✅ *${myName}* gabung! (${game.players.length} orang)\nPemain: ${game.players.map(p => p.name).join(', ')}`,
        }, { quoted: raw });
    }

    if (sub === 'mulai' || sub === 'start') {
        if (game.status !== 'lobby') return sock.sendMessage(from, { text: '❌ Game udah jalan.' }, { quoted: raw });
        if (game.hostId !== primaryId && !isOwner) return sock.sendMessage(from, { text: '❌ Cuma host yang bisa mulai game ini.' }, { quoted: raw });
        if (game.players.length < 3) return sock.sendMessage(from, { text: `❌ Minimal 3 orang biar seru. Sekarang baru ${game.players.length}.` }, { quoted: raw });

        const [majorityWord, impostorWord] = pick(WORD_PAIRS);
        const shuffled   = shuffle(game.players);
        const impostorId = shuffled[0].id;

        game.majorityWord = majorityWord;
        game.impostorWord = impostorWord;
        for (const p of game.players) {
            p.isImpostor = p.id === impostorId;
            p.word = p.isImpostor ? impostorWord : majorityWord;
        }

        const dmFailed = [];

        game.status = 'diskusi';
        game.timer  = setTimeout(() => startVotingPhase(sock, from), DISKUSI_MS);

        const text =
            `🎮 *Game dimulai!* (${game.players.length} pemain)\n` +
            `Kata udah dibagi diam-diam. *DM bot ini secara pribadi*, terus ketik *.impostor kata* buat liat kata rahasia kamu.\n\n` +
            `Diskusi bareng, jelasin kata kalian tanpa nyebut langsung. Waktu: 3 menit, abis itu voting otomatis.`;

        return sock.sendMessage(from, { text, mentions: game.players.map(p => p.id) }, { quoted: raw });
    }

    if (sub === 'vote') {
        if (game.status !== 'voting') return sock.sendMessage(from, { text: '❌ Belum masuk fase voting.' }, { quoted: raw });
        if (!game.players.some(p => p.id === primaryId)) return sock.sendMessage(from, { text: '❌ Kamu bukan pemain di game ini.' }, { quoted: raw });

        const targetJid = mentionedJid?.[0];
        if (!targetJid) return sock.sendMessage(from, { text: '❌ Tag orang yang mau kamu vote. Contoh: *.impostor vote @orang*' }, { quoted: raw });

        const cleanTarget = targetJid.includes('@') ? targetJid.split(':')[0] : `${targetJid.split(':')[0]}@s.whatsapp.net`;
        const targetNum   = cleanTarget.split('@')[0];
        const targetPlayer = game.players.find(p => p.id.split('@')[0] === targetNum);

        if (!targetPlayer) return sock.sendMessage(from, { text: '❌ Orang itu bukan pemain di game ini.' }, { quoted: raw });
        if (targetPlayer.id === primaryId) return sock.sendMessage(from, { text: '❌ Gak bisa vote diri sendiri.' }, { quoted: raw });

        game.votes[primaryId] = targetPlayer.id;

        await sock.sendMessage(from, { text: `🗳️ *${myName}* udah vote. (${Object.keys(game.votes).length}/${game.players.length})` }, { quoted: raw });

        if (Object.keys(game.votes).length >= game.players.length) {
            await finalizeVote(sock, from);
        }
        return;
    }

    return sock.sendMessage(from, { text: '❓ Subcommand gak dikenal. Ketik *.impostor* buat liat menu.' }, { quoted: raw });
}
