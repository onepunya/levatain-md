import { pick, shuffle, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('impostor', 'wordwolf')
    .in('fun')
    .desc('Word impostor game (Word Wolf) — same word for all except 1 impostor')
    .prefixOnly()
    .ai({
        trigger: 'User wants to play impostor/word wolf or check their secret word in their own group',
        examples: [
            'impostor create',
            'impostor join',
            'impostor start',
            'impostor vote @person',
            'impostor status',
            'impostor mykata',
        ],
        args: { text: 'Subcommands: create, join, start, vote, status, cancel, mykata' },
    })
    .run(async (sock, { body, raw, from, primaryId, pushname, gdb, mentionedJid, isOwner, isGroup  }) => {
        const args = body.trim().split(/\s+/);
        const sub  = (args[1] || '').toLowerCase();

        const myName = pushname || nameOf(gdb, primaryId);

        if (sub === 'kata' || sub === 'mykata' || sub === 'cek') {
            if (isGroup) {
                return sock.sendMessage(from, {
                    text: `🤫 For secrecy, DM me and type *.impostor kata* there, ${myName}.`,
                }, { quoted: raw });
            }

            const found = [];
            for (const g of games.values()) {
                if (g.status !== 'discussion' && g.status !== 'voting') continue;
                const p = g.players.find(pl => isSamePerson(primaryId, pl.id, gdb));
                if (p) found.push(p);
            }

            if (!found.length) {
                return sock.sendMessage(from, {
                    text: msg('impostor.not_in_game'),
                }, { quoted: raw });
            }

            const text = found.map(p => `🕵️ Your secret word: *${p.word}*`).join('\n\n');
            return sock.sendMessage(from, { text }, { quoted: raw });
        }

        if (GROUP_ONLY_SUBS.has(sub) && !isGroup) {
            return sock.sendMessage(from, { text: msg('sys.group_only_short') }, { quoted: raw });
        }

        const game = games.get(from);

        if (!sub || sub === 'help' || sub === 'menu') {
            return sock.sendMessage(from, {
                text:
                    `🕵️ *IMPOSTOR (Word Wolf)*\n\n` +
                    `*.impostor create* — create a new lobby\n` +
                    `*.impostor join* — join the lobby\n` +
                    `*.impostor start* — start the game (host, min. 3 players)\n` +
                    `*.impostor vote @person* — vote during the voting phase\n` +
                    `*.impostor status* — check the game status\n` +
                    `*.impostor cancel* — cancel the game (host/owner)\n` +
                    `*.impostor mykata* — check your secret word (MUST be done via DM to the bot)\n\n` +
                    `_How to play: everyone gets the same word, except for 1 impostor with a different word. Get your word by DMing the bot first and typing .impostor mykata. Discuss without saying the word directly, then vote on who you suspect is the impostor._`,
            }, { quoted: raw });
        }

        if (sub === 'status') {
            if (!game) return sock.sendMessage(from, { text: msg('impostor.idle') }, { quoted: raw });
            const names = game.players.map(p => p.name).join(', ');
            return sock.sendMessage(from, {
                text: `ℹ️ Status: *${game.status}*\nPlayers (${game.players.length}): ${names}`,
            }, { quoted: raw });
        }

        if (sub === 'cancel' || sub === 'stop' || sub === 'batal') {
            if (!game) return sock.sendMessage(from, { text: msg('impostor.no_game') }, { quoted: raw });
            if (game.hostId !== primaryId && !isOwner) {
                return sock.sendMessage(from, { text: msg('impostor.host_cancel') }, { quoted: raw });
            }
            resetGame(from);
            return sock.sendMessage(from, { text: msg('done.game_cancel') }, { quoted: raw });
        }

        if (sub === 'buat' || sub === 'create') {
            if (game) return sock.sendMessage(from, { text: msg('impostor.exists_status', { status: game.status }) }, { quoted: raw });

            games.set(from, {
                status:  'lobby',
                hostId:  primaryId,
                players: [{ id: primaryId, name: myName }],
                votes:   {},
                timer:   null,
            });

            return sock.sendMessage(from, {
                text:
                    `🕵️ *Impostor lobby created by ${myName}!*\n\n` +
                    `Type *.impostor join* to join.\n` +
                    `Need at least 3 players; host types *.impostor start* when ready.`,
            }, { quoted: raw });
        }

        if (!game) {
            return sock.sendMessage(from, { text: msg('impostor.no_lobby') }, { quoted: raw });
        }

        if (sub === 'join' || sub === 'gabung') {
            if (game.status !== 'lobby') return sock.sendMessage(from, { text: msg('impostor.started') }, { quoted: raw });
            if (game.players.some(p => p.id === primaryId)) return sock.sendMessage(from, { text: msg('impostor.lobby') }, { quoted: raw });

            game.players.push({ id: primaryId, name: myName });
            return sock.sendMessage(from, {
                text: msg('done.joined_game', { name: myName, n: game.players.length, players: game.players.map(p => p.name).join(', ') }),
            }, { quoted: raw });
        }

        if (sub === 'start' || sub === 'mulai') {
            if (game.status !== 'lobby') return sock.sendMessage(from, { text: msg('impostor.running') }, { quoted: raw });
            if (game.hostId !== primaryId && !isOwner) return sock.sendMessage(from, { text: msg('impostor.host_start') }, { quoted: raw });
            if (game.players.length < 3) return sock.sendMessage(from, { text: msg('impostor.min3_n', { n: game.players.length }) }, { quoted: raw });

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

            game.status = 'discussion';
            game.timer  = setTimeout(() => startVotingPhase(sock, from), DISKUSI_MS);

            const text =
                `🎮 *Game started!* (${game.players.length} players)\n` +
                `Words were dealt secretly. *DM this bot*, then type *.impostor mykata* to see your secret word.\n\n` +
                `Discuss together, describe your word without saying it directly. Time: 3 minutes, then voting starts automatically.`;

            return sock.sendMessage(from, { text, mentions: game.players.map(p => p.id) }, { quoted: raw });
        }

        if (sub === 'vote') {
            if (game.status !== 'voting') return sock.sendMessage(from, { text: msg('impostor.not_voting') }, { quoted: raw });
            if (!game.players.some(p => p.id === primaryId)) return sock.sendMessage(from, { text: msg('impostor.not_player') }, { quoted: raw });

            const targetJid = mentionedJid?.[0];
            if (!targetJid) return sock.sendMessage(from, { text: msg('impostor.vote_tag') }, { quoted: raw });

            const cleanTarget = targetJid.includes('@') ? targetJid.split(':')[0] : `${targetJid.split(':')[0]}@s.whatsapp.net`;
            const targetNum   = cleanTarget.split('@')[0];
            const targetPlayer = game.players.find(p => p.id.split('@')[0] === targetNum);

            if (!targetPlayer) return sock.sendMessage(from, { text: msg('impostor.not_target') }, { quoted: raw });
            if (targetPlayer.id === primaryId) return sock.sendMessage(from, { text: msg('impostor.self_vote') }, { quoted: raw });

            game.votes[primaryId] = targetPlayer.id;

            await sock.sendMessage(from, { text: msg('done.vote', { name: myName, n: Object.keys(game.votes).length, total: game.players.length }) }, { quoted: raw });

            if (Object.keys(game.votes).length >= game.players.length) {
                await finalizeVote(sock, from);
            }
            return;
        }

        return sock.sendMessage(from, { text: msg('impostor.unknown_sub') }, { quoted: raw });
    });

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
        text: `${resultText}\n\n📜 *Reveal:*\n${list}\n\nMajority word: *${game.majorityWord}*\nImpostor word: *${game.impostorWord}*\n\nType *.impostor create* to play again.`,
        mentions: game.players.map(p => p.id),
    });

    games.delete(from);
}

async function startVotingPhase(sock, from) {
    const game = games.get(from);
    if (!game || game.status !== 'discussion') return;

    game.status = 'voting';
    game.votes  = {};
    clearTimers(game);

    await sock.sendMessage(from, {
        text:
            `🗳️ *Discussion time is up! Time to vote.*\n\n` +
            `Type *.impostor vote @user* to vote who you think is the impostor.\n` +
            `Voting closes in 2 minutes or when everyone has voted.`,
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
        return revealAndEnd(sock, from, game, `😶 *Nobody voted.* Impostor wins by default!`);
    }

    entries.sort((a, b) => b[1] - a[1]);
    const topVotes = entries[0][1];
    const topTargets = entries.filter(([, v]) => v === topVotes).map(([id]) => id);

    if (topTargets.length > 1) {
        return revealAndEnd(sock, from, game, `🤝 *Vote tied!* Nobody is out. Impostor wins by default!`);
    }

    const eliminatedId = topTargets[0];
    const eliminated   = game.players.find(p => p.id === eliminatedId);

    if (eliminated?.isImpostor) {
        return revealAndEnd(sock, from, game, `🎉 *${eliminated.name}* got voted out and turned out to be the IMPOSTOR!\n\n*Villagers win!* 👏`);
    } else {
        return revealAndEnd(sock, from, game, `😈 *${eliminated?.name || '???'}* got voted out, but was NOT the impostor!\n\n*Impostor wins!*`);
    }
}

